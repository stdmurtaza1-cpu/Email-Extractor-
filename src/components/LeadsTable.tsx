import React, { useState } from 'react';
import { Mail, FileSpreadsheet, ExternalLink, ShieldCheck, Database, Trash2, RefreshCw, Layers } from 'lucide-react';
import { ExtractedEmail } from '../types.js';

interface LeadsTableProps {
  emails: ExtractedEmail[];
  isSyncingSheets: boolean;
  onClearLeads: () => Promise<void>;
  onForceSync: () => Promise<void>;
}

export default function LeadsTable({ emails, isSyncingSheets, onClearLeads, onForceSync }: LeadsTableProps) {
  const [searchTerm, setSearchTerm] = useState('');

  // Extract hostname for cleaner display of source pages
  const getDomainFromUrl = (urlString: string) => {
    try {
      const url = new URL(urlString);
      return url.hostname.replace('www.', '');
    } catch (e) {
      return urlString;
    }
  };

  const filteredEmails = emails.filter((item) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      item.email.toLowerCase().includes(searchLower) ||
      item.trade.toLowerCase().includes(searchLower) ||
      item.location.toLowerCase().includes(searchLower) ||
      item.sourceUrl.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div id="leads-table-card" className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-4 text-slate-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center space-x-2.5">
          <Database className="text-slate-400 w-5 h-5" />
          <h3 className="font-semibold text-white text-base">Extracted Contractors Leads ({filteredEmails.length})</h3>
        </div>

        <div className="flex items-center space-x-2">
          {emails.some(e => !e.syncedToSheet) && (
            <button
              onClick={onForceSync}
              disabled={isSyncingSheets}
              className="px-3.5 py-1.5 text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/20 transition-all flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isSyncingSheets ? 'animate-spin' : ''}`} />
              <span>Retry Sync Outstanding ({emails.filter(e => !e.syncedToSheet).length})</span>
            </button>
          )}

          {emails.length > 0 && (
            <button
              onClick={onClearLeads}
              className="px-3 py-1.5 text-xs font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg hover:bg-rose-500/20 transition-all flex items-center space-x-1 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-405" />
              <span>Reset Lists</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center space-x-2 bg-slate-950 border border-slate-800 px-3.5 py-2.5 rounded-xl">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Filter contractors by email, trade segment, location index or document source..."
          className="w-full text-xs text-slate-200 bg-transparent focus:outline-none focus:ring-0 placeholder:text-slate-500"
        />
      </div>

      {/* Main Table view */}
      <div className="overflow-x-auto max-h-[350px] border border-slate-800 rounded-2xl bg-slate-950/40">
        {filteredEmails.length === 0 ? (
          <div className="text-slate-500 italic text-xs h-[180px] flex flex-col items-center justify-center p-6 text-center space-y-2">
            <Mail className="w-8 h-8 opacity-30 text-slate-600" />
            <p>
              {searchTerm 
                ? 'No matching leads found for current filters.' 
                : 'Scraped lead contact rows will list dynamically here! Start a job to inspect email extraction.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-semibold sticky top-0 select-none">
                <th className="py-2.5 px-4 font-semibold text-[10px]">Email Address</th>
                <th className="py-2.5 px-4 font-semibold text-[10px]">Contractor Segment</th>
                <th className="py-2.5 px-4 font-semibold text-[10px]">Source Document (Crawl URL)</th>
                <th className="py-2.5 px-4 font-semibold text-[10px] text-center">Sheets Sync</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850 text-slate-300">
              {filteredEmails.map((item) => (
                <tr key={item.id} className="hover:bg-slate-900/50 transition-colors">
                  <td className="py-2.5 px-4 font-mono select-all">
                    <span className="font-semibold text-white">{item.email}</span>
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center space-x-1">
                      <span className="font-medium text-slate-300">{item.trade}</span>
                      <span className="text-slate-500 text-[10px]">({item.location})</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-4 font-mono max-w-xs truncate">
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-400 hover:underline flex items-center space-x-1 font-mono hover:text-indigo-300"
                    >
                      <span>{getDomainFromUrl(item.sourceUrl)}</span>
                      <ExternalLink className="w-3 h-3 flex-shrink-0" />
                    </a>
                  </td>
                  <td className="py-2.5 px-4 text-center">
                    {item.syncedToSheet ? (
                      <span className="inline-flex items-center justify-center space-x-1 text-emerald-400">
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        <span className="font-semibold text-[10px] font-mono">Active Saved</span>
                      </span>
                    ) : (
                      <span 
                        className="inline-flex items-center justify-center space-x-1 text-slate-450" 
                        title={item.syncError || 'Awaiting target authorization credential to auto-sync.'}
                      >
                        <Database className="w-3.5 h-3.5 text-slate-500" />
                        <span className="text-[10px] italic font-mono text-slate-400">Local Buffered</span>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
