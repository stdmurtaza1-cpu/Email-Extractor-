import axios from 'axios';
import { getDB, saveDB, appendLog } from './db.js';
import { ExtractedEmail } from '../types.js';

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

/**
 * Exchanges OAuth Code for Google Access and Refresh Tokens
 */
export async function handleOAuthCallback(code: string, redirectUri: string): Promise<boolean> {
  const db = getDB();
  const { clientId, clientSecret } = db.config;

  if (!clientId || !clientSecret) {
    appendLog('Cannot request sheets tokens: Client ID or Client Secret is not set. Please update settings.', 'error');
    return false;
  }

  try {
    const response = await axios.post<TokenResponse>('https://oauth2.googleapis.com/token', {
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    const { access_token, refresh_token, expires_in } = response.data;
    
    // Fetch user profile info
    let userEmail = '';
    let userName = '';
    try {
      const userRes = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      userEmail = userRes.data.email || '';
      userName = userRes.data.name || '';
    } catch (e) {
      appendLog('Failed to fetch user profile info, continuing with token...', 'warn');
    }

    db.googleAuth = {
      accessToken: access_token,
      refreshToken: refresh_token || db.googleAuth?.refreshToken,
      expiryDate: Date.now() + (expires_in * 1000),
      userEmail,
      userName,
    };

    saveDB(db);
    appendLog(`Successfully connected Google Sheets account: ${userEmail || 'Authenticated'}`, 'success');
    
    // Auto sync any unsynced emails in the background
    syncPendingEmails().catch(err => {
      appendLog(`Error during initial sheet sync queue: ${err.message}`, 'warn');
    });

    return true;
  } catch (error: any) {
    const errMsg = error.response?.data?.error_description || error.message;
    appendLog(`OAuth Token Exchange failed: ${errMsg}`, 'error');
    return false;
  }
}

/**
 * Ensures a valid access token. If expired, attempts to refresh using refresh token.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const db = getDB();
  if (!db.googleAuth) return null;

  const { accessToken, refreshToken, expiryDate } = db.googleAuth;
  const { clientId, clientSecret } = db.config;

  // If token is still valid (with a 2-minute buffer)
  if (expiryDate && expiryDate - Date.now() > 120000) {
    return accessToken;
  }

  // We need to refresh
  if (!refreshToken) {
    appendLog('Google Access token expired, and no Refresh token found. Please re-authenticate.', 'warn');
    return null;
  }

  if (!clientId || !clientSecret) {
    appendLog('Failed to refresh access token: Google Client ID/Secret missing from config.', 'error');
    return null;
  }

  try {
    appendLog('Google Access Token expired. Refreshing token...', 'info');
    const response = await axios.post<TokenResponse>('https://oauth2.googleapis.com/token', {
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });

    const { access_token, expires_in } = response.data;
    db.googleAuth = {
      ...db.googleAuth,
      accessToken: access_token,
      expiryDate: Date.now() + (expires_in * 1000),
    };
    saveDB(db);
    return access_token;
  } catch (error: any) {
    const errMsg = error.response?.data?.error_description || error.message;
    appendLog(`Failed to refresh Google Access Token: ${errMsg}. Please sign in again.`, 'error');
    return null;
  }
}

/**
 * Appends a list of rows to Google Sheets
 */
async function appendRowToSheet(sheetId: string, accessToken: string, values: any[][]): Promise<boolean> {
  try {
    // Append rows to Sheet (defaulting to the first sheet dynamically)
    const range = 'A1';
    const response = await axios.post(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}:append?valueInputOption=USER_ENTERED`,
      {
        values,
        majorDimension: 'ROWS',
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return response.status === 200;
  } catch (error: any) {
    const errorDetails = error.response?.data?.error?.message || error.message;
    throw new Error(errorDetails);
  }
}

/**
 * Syncs a single email entry to Google Sheets
 */
export async function syncEmailToSheet(emailObj: ExtractedEmail): Promise<boolean> {
  const db = getDB();
  const { sheetId } = db.config;
  
  const token = await getValidAccessToken();
  if (!token) {
    appendLog(`Skipping Sheet Append for ${emailObj.email}: No active Google Sheets connection. Saved locally instead.`, 'warn');
    return false;
  }

  try {
    const row = [
      emailObj.email,
      emailObj.trade,
      emailObj.location,
      emailObj.sourceUrl,
      emailObj.extractedAt,
    ];
    
    await appendRowToSheet(sheetId, token, [row]);
    
    // Update local synced state
    const currentDb = getDB();
    const match = currentDb.emails.find(e => e.id === emailObj.id);
    if (match) {
      match.syncedToSheet = true;
      delete match.syncError;
      saveDB(currentDb);
    }
    return true;
  } catch (error: any) {
    appendLog(`Failed syncing email ${emailObj.email} to Sheet: ${error.message}`, 'error');
    
    const currentDb = getDB();
    const match = currentDb.emails.find(e => e.id === emailObj.id);
    if (match) {
      match.syncError = error.message;
      saveDB(currentDb);
    }
    return false;
  }
}

/**
 * Scans the database for any unsynced emails and attempts to batch append them to the sheet
 */
export async function syncPendingEmails(): Promise<number> {
  const db = getDB();
  const pending = db.emails.filter(e => !e.syncedToSheet);
  if (pending.length === 0) return 0;

  const token = await getValidAccessToken();
  if (!token) {
    appendLog(`Cannot sync ${pending.length} pending emails: Google Sheets not authenticated.`, 'warn');
    return 0;
  }

  appendLog(`Syncing ${pending.length} pending emails to Google Sheet...`, 'info');
  const rows = pending.map(e => [e.email, e.trade, e.location, e.sourceUrl, e.extractedAt]);
  
  try {
    await appendRowToSheet(db.config.sheetId, token, rows);
    
    // Update all matching items
    const currentDb = getDB();
    const pendingIds = pending.map(p => p.id);
    currentDb.emails.forEach(e => {
      if (pendingIds.includes(e.id)) {
        e.syncedToSheet = true;
        delete e.syncError;
      }
    });
    saveDB(currentDb);
    
    appendLog(`Successfully synced ${pending.length} emails to Google Sheet.`, 'success');
    return pending.length;
  } catch (error: any) {
    appendLog(`Failed syncing pending emails batch: ${error.message}`, 'error');
    return 0;
  }
}
