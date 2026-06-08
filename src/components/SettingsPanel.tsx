import React, { useState } from 'react';
import { Settings, ShieldCheck, Mail, ShieldAlert, CheckCircle, RefreshCw, Key, HelpCircle, FileSpreadsheet } from 'lucide-react';

interface SettingsPanelProps {
  config: {
    sheetId: string;
    clientId: string;
    clientSecretPlaceholder: string;
    delayMs: number;
  };
  googleUser: {
    email?: string;
    name?: string;
  } | null;
  onSaveConfig: (updated: {
    sheetId: string;
    clientId: string;
    clientSecret: string;
    delayMs: number;
  }) => Promise<void>;
  onDisconnect: () => Promise<void>;
}

export default function SettingsPanel({ config, googleUser, onSaveConfig, onDisconnect }: SettingsPanelProps) {
  const [sheetId, setSheetId] = useState(config.sheetId);
  const [clientId, setClientId] = useState(config.clientId);
  const [clientSecret, setClientSecret] = useState('');
  const [delayMs, setDelayMs] = useState(config.delayMs);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSaveConfig({
        sheetId,
        clientId,
        clientSecret: clientSecret || config.clientSecretPlaceholder || '',
        delayMs
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleConnectSheet = async () => {
    if (!clientId) {
      alert('You must provide a valid Google Client ID in settings to authorise account access.');
      return;
    }

    try {
      setIsConnecting(true);
      const res = await fetch('/api/auth/url');
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to get auth URL');
      }
      const data = await res.json();
      
      // Open standard OAuth popup window securely
      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;
      
      const authWindow = window.open(
        data.url,
        'google_oauth_popup',
        `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes`
      );

      if (!authWindow) {
        alert('Credentials login popup blocked by your browser. Please allow popups to connect Google Sheets!');
      }
    } catch (err: any) {
      alert(err.message || 'Error occurred starting Google Auth.');
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div id="settings-panel-card" className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-6 text-slate-200">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center space-x-2.5">
          <Settings className="text-slate-400 w-5 h-5" />
          <h3 className="font-semibold text-white text-lg">System & OAuth Setup</h3>
        </div>
        <div className="flex items-center space-x-1">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span className="text-xs text-slate-400 font-medium font-mono">Safe Sandbox SSL</span>
        </div>
      </div>

      {/* Spreadsheet Sync Authorization State */}
      <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start space-x-3.5">
          {googleUser ? (
            <div className="p-2.5 bg-emerald-500/15 rounded-xl text-emerald-400">
              <CheckCircle className="w-6 h-6 animate-pulse" />
            </div>
          ) : (
            <div className="p-2.5 bg-amber-500/15 rounded-xl text-amber-400">
              <ShieldAlert className="w-6 h-6" />
            </div>
          )}
          <div>
            <h4 className="font-medium text-slate-200 text-sm">Google Sheets Live Sync Engine</h4>
            <p className="text-xs text-slate-400 mt-1 select-all font-mono">
              {googleUser 
                ? `Connected to Workspace: ${googleUser.name || 'Account'} (${googleUser.email})` 
                : 'Authentication Disconnected. Extracted emails will buffer locally until configured.'}
            </p>
          </div>
        </div>

        <div>
          {googleUser ? (
            <button
              onClick={onDisconnect}
              className="w-full md:w-auto px-4 py-2 text-xs font-semibold text-rose-400 bg-rose-500/15 border border-rose-500/20 rounded-xl hover:bg-rose-500/25 transition-all duration-200 cursor-pointer"
            >
              Disconnect Sheet
            </button>
          ) : (
            <button
              onClick={handleConnectSheet}
              disabled={isConnecting}
              className="w-full md:w-auto px-4 py-2.5 text-xs font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-500 transition-all duration-200 shadow-lg shadow-indigo-500/10 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isConnecting ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-4 h-4" />
              )}
              <span>Authorize Google Account</span>
            </button>
          )}
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        {/* Google Spreadsheet ID */}
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center space-x-1">
            <FileSpreadsheet className="w-3.5 h-3.5 text-slate-500" />
            <span>Target Google Sheet ID</span>
          </label>
          <input
            type="text"
            required
            value={sheetId}
            onChange={(e) => setSheetId(e.target.value)}
            placeholder="paste spreadsheet ID (e.g. 1ppISze8XUXfqC7cre5ELqSKwYJ08Zkf4o13hhvop61E)"
            className="w-full px-4 py-3 text-sm text-slate-200 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-mono"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Custom Google OAuth Client ID */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center space-x-1">
              <Key className="w-3.5 h-3.5 text-slate-500" />
              <span>Google Client ID</span>
            </label>
            <input
              type="text"
              required
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="e.g. 12345678-abc.apps.googleusercontent.com"
              className="w-full px-4 py-3 text-sm text-slate-200 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-mono"
            />
          </div>

          {/* Custom Google OAuth Client Secret */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center space-x-1">
              <Key className="w-3.5 h-3.5 text-slate-500" />
              <span>Google Client Secret</span>
            </label>
            <input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder={config.clientSecretPlaceholder || "OAuth Client Secret"}
              className="w-full px-4 py-3 text-sm text-slate-200 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-mono"
            />
          </div>
        </div>

        {/* Crawling Delay Interval to completely avoid captchas */}
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
            Auto Scraper Rate-Limiting delay : <span className="font-bold text-indigo-400">{(delayMs / 1000).toFixed(1)}s</span>
          </label>
          <input
            type="range"
            min="3000"
            max="30000"
            step="1000"
            value={delayMs}
            onChange={(e) => setDelayMs(Number(e.target.value))}
            className="w-full accent-indigo-500 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
            <span>Fast (3s) - Captcha Risks</span>
            <span>Balanced (8s-12s) - Safe scraping</span>
            <span>Ultra Slow (30s) - Extremely Stealth</span>
          </div>
        </div>

        <div className="flex items-center space-x-3.5 pt-2">
          <button
            type="submit"
            disabled={isSaving}
            className="flex-1 px-5 py-3 text-xs font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-500 transition-all duration-200 shadow-md shadow-indigo-600/10 active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {isSaving ? 'Saving Configurations...' : 'Save Scraper Settings'}
          </button>
          
          {saveSuccess && (
            <span className="text-xs font-semibold text-emerald-400 animate-fade-in animate-pulse">
              ✓ Config Saved!
            </span>
          )}
        </div>
      </form>

      {/* Instructional Guide Block */}
      <div className="border-t border-slate-800 pt-5 space-y-3.5">
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
          <HelpCircle className="w-4 h-4 text-slate-500" />
          <span>Configuring Google API Access:</span>
        </h4>
        <ol className="text-xs text-slate-400 space-y-2 list-decimal list-inside leading-relaxed bg-slate-950/40 p-4 border border-slate-850 rounded-2xl font-mono">
          <li>
            Open Google Cloud Console:{' '}
            <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline font-semibold">
              GCP Credentials Panel
            </a>
          </li>
          <li>Create an <b>OAuth Client ID</b> (Web application).</li>
          <li>
            Add this callback to <b>Authorized Redirect URIs</b>:
            <div className="mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-[10px] select-all break-all text-slate-300">
              {process.env.APP_URL || window.location.origin}/auth/callback
            </div>
          </li>
          <li>Enable <b>Google Sheets API</b> in your Cloud Console library.</li>
          <li>Paste the generated <b>Client ID</b> and <b>Secret</b> above, save and authorise spreadsheet permissions to execute.</li>
        </ol>
      </div>
    </div>
  );
}
