/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Lock, 
  MapPin, 
  RefreshCw, 
  FileSpreadsheet, 
  Mail, 
  CheckCircle2, 
  Play, 
  AlertCircle, 
  Pause, 
  ChevronRight, 
  Zap,
  CheckCircle,
  Clock,
  Briefcase
} from 'lucide-react';
import SettingsPanel from './components/SettingsPanel.js';
import QueueManager from './components/QueueManager.js';
import ConsoleLogs from './components/ConsoleLogs.js';
import LeadsTable from './components/LeadsTable.js';
import { ScraperStats, ScraperTask, ExtractedEmail, ScraperLog } from './types.js';

export default function App() {
  const [stats, setStats] = useState<ScraperStats>({
    totalTasks: 0,
    pendingTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    totalEmails: 0,
    syncedEmails: 0,
    unsyncedEmails: 0,
    isScrapingActive: false,
    isConnectedToSheets: false,
  });

  const [config, setConfig] = useState({
    sheetId: '1ppISze8XUXfqC7cre5ELqSKwYJ08Zkf4o13hhvop61E',
    clientId: '',
    clientSecretPlaceholder: '',
    delayMs: 8000,
  });

  const [googleUser, setGoogleUser] = useState<{ email?: string; name?: string } | null>(null);
  const [tasks, setTasks] = useState<ScraperTask[]>([]);
  const [emails, setEmails] = useState<ExtractedEmail[]>([]);
  const [logs, setLogs] = useState<ScraperLog[]>([]);
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Initial Data Fetch
  const fetchAllData = async () => {
    try {
      const [statusRes, tasksRes, emailsRes, logsRes] = await Promise.all([
        fetch('/api/status'),
        fetch('/api/tasks'),
        fetch('/api/emails'),
        fetch('/api/logs'),
      ]);

      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setStats(statusData.stats);
        setConfig(statusData.config);
        setGoogleUser(statusData.googleUser);
      }

      if (tasksRes.ok) {
        const tasksData = await tasksRes.json();
        setTasks(tasksData);
      }

      if (emailsRes.ok) {
        const emailsData = await emailsRes.json();
        setEmails(emailsData);
      }

      if (logsRes.ok) {
        const logsData = await logsRes.json();
        setLogs(logsData);
      }
    } catch (err) {
      console.error('Error polling dashboard state:', err);
    }
  };

  useEffect(() => {
    fetchAllData();
    
    // Low latency polling to ensure real-time terminal output and status updating
    const interval = setInterval(() => {
      fetchAllData();
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  // Listen for Google OAuth successful messages from popup
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Basic origin safety check
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost')) {
        return;
      }
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        fetchAllData();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Action: Save Config
  const handleSaveConfig = async (updated: {
    sheetId: string;
    clientId: string;
    clientSecret: string;
    delayMs: number;
  }) => {
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Action: Disconnect Auth Account
  const handleDisconnect = async () => {
    if (!window.confirm('Are you sure you want to disconnect Google Sheets integration? Scraping will continue saving locally.')) {
      return;
    }
    try {
      const res = await fetch('/api/auth/disconnect', { method: 'POST' });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Action: Import Tasks pairings
  const handleImportTasks = async (trades: string[], locations: string[]) => {
    try {
      const res = await fetch('/api/tasks/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trades, locations }),
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Action: Clear entire queue
  const handleClearQueue = async () => {
    if (!window.confirm('Clear all tasks from the current target queue?')) {
      return;
    }
    try {
      const res = await fetch('/api/tasks/clear', { method: 'POST' });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Action: Delete Specific Task Pair from Queue
  const handleDeleteTask = async (id: string) => {
    try {
      const res = await fetch('/api/tasks/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Action: Start Scraper loop
  const handleStartScraper = async () => {
    try {
      const res = await fetch('/api/scraper/start', { method: 'POST' });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Action: Stop Scraper loop
  const handleStopScraper = async () => {
    try {
      const res = await fetch('/api/scraper/stop', { method: 'POST' });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Action: Clear Extracted lead history
  const handleClearLeads = async () => {
    if (!window.confirm('Delete all locally extracted email records? This is irreversible.')) {
      return;
    }
    try {
      const res = await fetch('/api/emails/clear', { method: 'POST' });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Action: Batch Sync Outstanding Leads to Google Sheets
  const handleForceSync = async () => {
    setIsSyncingSheets(true);
    try {
      const res = await fetch('/api/sheets/sync', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        alert(`Successfully synced ${data.count} buffered emails to Spreadsheet!`);
        await fetchAllData();
      }
    } catch (err) {
      console.error(err);
      alert('Failed syncing buffered items. Ensure Google Account connection is authorized.');
    } finally {
      setIsSyncingSheets(false);
    }
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await fetchAllData();
    setTimeout(() => setIsRefreshing(false), 800);
  };

  return (
    <div id="full-dashboard" className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased">
      
      {/* 1. Masthead Header */}
      <header className="bg-slate-900 border-b border-slate-810 py-4.5 px-6 sticky top-0 z-40 shadow-xl backdrop-blur-md bg-slate-900/90 border-slate-800">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          
          <div className="flex items-center space-x-3 text-center md:text-left">
            <div className="h-10 w-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold leading-none shadow-md shadow-indigo-500/10">
              <Zap className="w-5 h-5 text-emerald-400 animate-pulse" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white font-sans tracking-tight mb-0.5">
                General Contractor Email Autoscraper & Sheets Sync
              </h1>
              <p className="text-xs text-slate-400 font-medium flex items-center justify-center md:justify-start space-x-1">
                <span>Enterprise Lead Generation</span>
                <ChevronRight className="w-3 h-3 text-slate-600" />
                <span className="text-indigo-400 select-all font-mono">ID: {config.sheetId ? config.sheetId.slice(0, 12) + '...' : '1ppISze8X...'}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Real-time sync status badge */}
            {stats.isScrapingActive ? (
              <span className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-xs font-semibold text-emerald-400 font-mono">
                <span className="h-2 w-2 rounded-full bg-emerald-450 animate-ping"></span>
                <span>SCRAPER RUNNING</span>
              </span>
            ) : (
              <span className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-900/60 text-xs font-semibold text-slate-400 font-mono">
                <span className="h-2 w-2 rounded-full bg-slate-600"></span>
                <span>ENGINE PAUSED</span>
              </span>
            )}

            <button
              onClick={handleManualRefresh}
              className="p-2 border border-slate-800 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors bg-slate-900 shadow-sm cursor-pointer"
              title="Refresh State"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>

        </div>
      </header>

      {/* 2. Main Dashboard Stage */}
      <main className="flex-grow max-w-7xl mx-auto w-full px-4 sm:px-6 py-8 space-y-8 select-all">
        
        {/* Stats Row Bypassing Clutter */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-sm flex items-center space-x-4 text-slate-200"
          >
            <div className="p-3 bg-indigo-500/15 text-indigo-455 rounded-xl text-indigo-400">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Leads Secured</p>
              <h4 className="text-2xl font-bold text-white tracking-tight mt-0.5 font-mono">{stats.totalEmails}</h4>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-sm flex items-center space-x-4 text-slate-200"
          >
            <div className="p-3 bg-emerald-500/15 text-emerald-455 rounded-xl text-emerald-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Synced to Sheet</p>
              <h4 className="text-2xl font-bold text-white tracking-tight mt-0.5 font-mono">
                {stats.syncedEmails} <span className="text-xs text-slate-500 font-normal">({stats.totalEmails > 0 ? Math.round((stats.syncedEmails / stats.totalEmails) * 100) : 0}%)</span>
              </h4>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-sm flex items-center space-x-4 text-slate-200"
          >
            <div className="p-3 bg-sky-500/15 text-sky-455 rounded-xl text-sky-400">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Pairings Queue</p>
              <h4 className="text-2xl font-bold text-white tracking-tight mt-0.5 font-mono">
                {stats.completedTasks} <span className="text-xs font-normal text-slate-500">/ {stats.totalTasks}</span>
              </h4>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-sm flex items-center space-x-4 text-slate-200"
          >
            <div className="p-3 bg-amber-500/15 text-amber-455 rounded-xl text-amber-400">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Pending Segments</p>
              <h4 className="text-2xl font-bold text-white tracking-tight mt-0.5 font-mono">{stats.pendingTasks}</h4>
            </div>
          </motion.div>

        </div>

        {/* Bento Grid Panel Sections */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          
          {/* Settings Section */}
          <SettingsPanel 
            config={config} 
            googleUser={googleUser}
            onSaveConfig={handleSaveConfig}
            onDisconnect={handleDisconnect}
          />

          {/* Console Debug Panel */}
          <ConsoleLogs logs={logs} />

        </div>

        {/* Row 3: Scraper Targets and Queue Controls */}
        <QueueManager 
          tasks={tasks}
          isScrapingActive={stats.isScrapingActive}
          onImportTasks={handleImportTasks}
          onClearQueue={handleClearQueue}
          onDeleteTask={handleDeleteTask}
          onStartScraper={handleStartScraper}
          onStopScraper={handleStopScraper}
        />

        {/* Row 4: Leads Lists and Sync Details */}
        <LeadsTable 
          emails={emails} 
          isSyncingSheets={isSyncingSheets}
          onClearLeads={handleClearLeads}
          onForceSync={handleForceSync}
        />

      </main>

      {/* 3. Humble Page Footer */}
      <footer className="bg-slate-950 border-t border-slate-900 py-6 px-6 mt-12 text-center text-xs text-slate-500">
        <p className="max-w-xl mx-auto leading-relaxed">
          The AutoScraper runs background operations utilizing <b>Gemini Search Grounding</b>. Rate-limiting interval delays prevent search flag captures automatically without storing cache files on disk. Please review and manage security details under Google OAuth console.
        </p>
      </footer>

    </div>
  );
}
