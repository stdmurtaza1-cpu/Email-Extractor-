import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { getDB, saveDB, appendLog } from './src/server/db.js';
import { handleOAuthCallback, syncPendingEmails } from './src/server/sheets.js';
import { startScraperEngine, stopScraperEngine } from './src/server/scraper-engine.js';
import { ScraperTask, ScraperStats } from './src/types.js';

const app = express();
const PORT = 3000;

app.use(express.json());

// API: Check Health
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// API: Get Status & State
app.get('/api/status', (req, res) => {
  const db = getDB();
  const totalTasks = db.tasks.length;
  const pendingTasks = db.tasks.filter(t => t.status === 'pending').length;
  const completedTasks = db.tasks.filter(t => t.status === 'completed').length;
  const failedTasks = db.tasks.filter(t => t.status === 'failed').length;
  const totalEmails = db.emails.length;
  const syncedEmails = db.emails.filter(e => e.syncedToSheet).length;
  const unsyncedEmails = totalEmails - syncedEmails;

  const stats: ScraperStats = {
    totalTasks,
    pendingTasks,
    completedTasks,
    failedTasks,
    totalEmails,
    syncedEmails,
    unsyncedEmails,
    isScrapingActive: db.isScrapingActive,
    isConnectedToSheets: !!db.googleAuth?.accessToken,
  };

  res.json({
    stats,
    config: {
      sheetId: db.config.sheetId,
      clientId: db.config.clientId,
      // Hide client secret for secure UI
      clientSecretPlaceholder: db.config.clientSecret ? '••••••••••••••••' : '',
      delayMs: db.config.delayMs,
    },
    googleUser: db.googleAuth ? {
      email: db.googleAuth.userEmail,
      name: db.googleAuth.userName,
    } : null,
  });
});

// API: Update Configuration
app.post('/api/config', (req, res) => {
  const { sheetId, clientId, clientSecret, delayMs } = req.body;
  const db = getDB();

  if (sheetId) db.config.sheetId = sheetId.trim();
  if (clientId) db.config.clientId = clientId.trim();
  if (clientSecret !== undefined && clientSecret !== '••••••••••••••••') {
    db.config.clientSecret = clientSecret.trim();
  }
  if (delayMs !== undefined) {
    db.config.delayMs = Math.max(1000, Number(delayMs)); // Ensure a minimum 1 second delay
  }

  saveDB(db);
  appendLog('Scraper Configuration updated.', 'info');
  res.json({ success: true });
});

// API: Generate OAuth Redirect Address
app.get('/api/auth/url', (req, res) => {
  const db = getDB();
  const { clientId } = db.config;

  if (!clientId) {
    return res.status(400).json({ error: 'You must set a valid Google Client ID under Settings first.' });
  }

  const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
  const redirectUri = `${appUrl}/auth/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
    access_type: 'offline',
    prompt: 'consent',
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  res.json({ url: authUrl });
});

// API: Google Sheets Auth Code Callback
app.get(['/auth/callback', '/auth/callback/'], async (req, res) => {
  const { code } = req.query;
  const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
  const redirectUri = `${appUrl}/auth/callback`;

  if (!code) {
    return res.send(`
      <html>
        <body style="font-family: sans-serif; text-align: center; margin-top: 50px; background-color: #f9fafb;">
          <h2 style="color: #ef4444;">OAuth Error</h2>
          <p>No authorization code received from Google.</p>
          <button onclick="window.close()" style="padding: 10px 20px; background-color: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer;">Close Window</button>
        </body>
      </html>
    `);
  }

  const success = await handleOAuthCallback(String(code), redirectUri);

  if (success) {
    res.send(`
      <html>
        <body style="font-family: sans-serif; text-align: center; margin-top: 50px; background-color: #f9fafb;">
          <h2 style="color: #10b981;">Connected Successfully!</h2>
          <p>Spreadsheet integration authorized. You can close this window now.</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
              setTimeout(() => { window.close(); }, 1500);
            }
          </script>
        </body>
      </html>
    `);
  } else {
    res.send(`
      <html>
        <body style="font-family: sans-serif; text-align: center; margin-top: 50px; background-color: #f9fafb;">
          <h2 style="color: #ef4444;">Connection Failed</h2>
          <p>Failed to exchange authorisation credentials. Double-check your Client ID and Client Secret.</p>
          <button onclick="window.close()" style="padding: 10px 20px; background-color: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer;">Close Window</button>
        </body>
      </html>
    `);
  }
});

// API: Disconnect Auth Account
app.post('/api/auth/disconnect', (req, res) => {
  const db = getDB();
  db.googleAuth = undefined;
  saveDB(db);
  appendLog('Google Sheets account disconnected.', 'warn');
  res.json({ success: true });
});

// API: Import Scraper Target Queue
app.post('/api/tasks/import', (req, res) => {
  const { trades, locations } = req.body;
  if (!trades || !locations || !Array.isArray(trades) || !Array.isArray(locations)) {
    return res.status(400).json({ error: 'Payload must contain trades and locations arrays.' });
  }

  const db = getDB();
  const currentPairings = db.tasks.map(t => `${t.trade.toLowerCase()}|${t.location.toLowerCase()}`);
  const added: ScraperTask[] = [];

  trades.forEach((tradeStr: string) => {
    const trade = tradeStr.trim();
    if (!trade) return;

    locations.forEach((locStr: string) => {
      const location = locStr.trim();
      if (!location) return;

      const key = `${trade.toLowerCase()}|${location.toLowerCase()}`;
      if (!currentPairings.includes(key)) {
        const newTask: ScraperTask = {
          id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          trade,
          location,
          status: 'pending',
        };
        db.tasks.push(newTask);
        added.push(newTask);
        currentPairings.push(key);
      }
    });
  });

  if (added.length > 0) {
    saveDB(db);
    appendLog(`Imported ${added.length} target location pairing(s) to scraping queue.`, 'success');
  }

  res.json({ count: added.length, tasks: db.tasks });
});

// API: List Tasks Queue
app.get('/api/tasks', (req, res) => {
  const db = getDB();
  res.json(db.tasks);
});

// API: Clear Tasks Queue
app.post('/api/tasks/clear', (req, res) => {
  const db = getDB();
  db.tasks = [];
  saveDB(db);
  appendLog('Scraping Target queue cleared.', 'warn');
  res.json({ success: true });
});

// API: Delete Specific Task Pair
app.post('/api/tasks/delete', (req, res) => {
  const { id } = req.body;
  const db = getDB();
  const index = db.tasks.findIndex(t => t.id === id);
  if (index !== -1) {
    const deleted = db.tasks.splice(index, 1)[0];
    saveDB(db);
    appendLog(`Removed target task: "${deleted.trade}" in "${deleted.location}" from queue.`, 'info');
  }
  res.json({ success: true });
});

// API: Log Entries
app.get('/api/logs', (req, res) => {
  const db = getDB();
  res.json(db.logs);
});

// API: Scraped Emails History
app.get('/api/emails', (req, res) => {
  const db = getDB();
  res.json(db.emails);
});

// API: Clear Scraped Emails
app.post('/api/emails/clear', (req, res) => {
  const db = getDB();
  db.emails = [];
  saveDB(db);
  appendLog('Extracted Emails local list cleared.', 'warn');
  res.json({ success: true });
});

// API: Sync Outstanding Pending Emails
app.post('/api/sheets/sync', async (req, res) => {
  const count = await syncPendingEmails();
  res.json({ count });
});

// API: Scraper Trigger - Start
app.post('/api/scraper/start', (req, res) => {
  startScraperEngine();
  res.json({ success: true });
});

// API: Scraper Trigger - Stop
app.post('/api/scraper/stop', (req, res) => {
  stopScraperEngine();
  res.json({ success: true });
});

// Start background state recovery
const dbOnLoad = getDB();
if (dbOnLoad.isScrapingActive) {
  // Scraper was running and server rebooted/resumed, carry on!
  dbOnLoad.isScrapingActive = false; // reset active flag to allow start engine to reset intervals cleanly
  saveDB(dbOnLoad);
  startScraperEngine();
}

async function startServer() {
  // Vite integration middleware handler
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening exclusively on port ${PORT}`);
  });
}

startServer();
