import React, { useState } from 'react';
import { PlayCircle, StopCircle, RefreshCw, Layers, MapPin, Wrench, Trash2, CheckCircle2, AlertTriangle, AlertCircle, Play } from 'lucide-react';
import { ScraperTask } from '../types.js';

interface QueueManagerProps {
  tasks: ScraperTask[];
  isScrapingActive: boolean;
  onImportTasks: (trades: string[], locations: string[]) => Promise<void>;
  onClearQueue: () => Promise<void>;
  onDeleteTask: (id: string) => Promise<void>;
  onStartScraper: () => Promise<void>;
  onStopScraper: () => Promise<void>;
}

export default function QueueManager({
  tasks,
  isScrapingActive,
  onImportTasks,
  onClearQueue,
  onDeleteTask,
  onStartScraper,
  onStopScraper,
}: QueueManagerProps) {
  const [tradesInput, setTradesInput] = useState('General Contractor');
  const [locationsInput, setLocationsInput] = useState('California');
  const [isImporting, setIsImporting] = useState(false);

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tradesInput.trim() || !locationsInput.trim()) {
      alert('Kindly fill in both target trades and target locations!');
      return;
    }

    setIsImporting(true);
    try {
      // Split by comma or newline, clean empty values
      const trades = tradesInput
        .split(/[\n,]+/)
        .map(t => t.trim())
        .filter(t => t.length > 0);
      
      const locations = locationsInput
        .split(/[\n,]+/)
        .map(l => l.trim())
        .filter(l => l.length > 0);

      await onImportTasks(trades, locations);
    } catch (err) {
      console.error(err);
    } finally {
      setIsImporting(false);
    }
  };

  const getStatusBadge = (status: ScraperTask['status']) => {
    switch (status) {
      case 'processing':
        return (
          <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full animate-pulse font-mono">
            <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
            <span>Extracting</span>
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full font-mono">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Completed</span>
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-full font-mono">
            <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
            <span>Failed</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold text-slate-400 bg-slate-800 border border-slate-700 rounded-full font-mono">
            <span>Pending</span>
          </span>
        );
    }
  };

  return (
    <div id="queue-manager-card" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      {/* 1. Pairing Inputs Portal */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between text-slate-200">
        <div className="space-y-4">
          <div className="flex items-center space-x-2.5 border-b border-slate-800 pb-3">
            <Layers className="text-slate-400 w-5 h-5" />
            <h3 className="font-semibold text-white text-base">Targets Configuration</h3>
          </div>

          <form onSubmit={handleImportSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center space-x-1">
                <Wrench className="w-3.5 h-3.5 text-slate-500" />
                <span>Unlimited Trades (Comma / Newline)</span>
              </label>
              <textarea
                rows={3}
                required
                value={tradesInput}
                onChange={(e) => setTradesInput(e.target.value)}
                placeholder="e.g.&#10;General Contractor&#10;Plumber&#10;Electrician"
                className="w-full px-4 py-3 text-sm text-slate-200 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-mono leading-relaxed placeholder:text-slate-600"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center space-x-1">
                <MapPin className="w-3.5 h-3.5 text-slate-500" />
                <span>Unlimited Locations (Comma / Newline)</span>
              </label>
              <textarea
                rows={3}
                required
                value={locationsInput}
                onChange={(e) => setLocationsInput(e.target.value)}
                placeholder="e.g.&#10;California&#10;Texas&#10;Florida"
                className="w-full px-4 py-3 text-sm text-slate-200 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-mono leading-relaxed placeholder:text-slate-600"
              />
            </div>

            <button
              type="submit"
              disabled={isImporting}
              className="w-full px-4 py-3 text-xs font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-500 transition-all duration-200 active:scale-[0.98] disabled:opacity-50 cursor-pointer shadow-lg shadow-indigo-600/10"
            >
              {isImporting ? 'Generating Queue Pairings...' : 'Generate Trade & Location Pairings'}
            </button>
          </form>
        </div>
      </div>

      {/* 2. Automation Engine Actions & Queue Table Grid */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm lg:col-span-2 flex flex-col justify-between h-[400px] lg:h-auto text-slate-200">
        <div className="flex flex-col h-full justify-between space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-center space-x-2.5">
              <RefreshCw className={`text-slate-400 w-5 h-5 ${isScrapingActive ? 'animate-spin' : ''}`} />
              <h3 className="font-semibold text-white text-base">
                Scraping Target Queue ({tasks.length})
              </h3>
            </div>

            {/* Core Action Triggers */}
            <div className="flex items-center space-x-2">
              {tasks.length > 0 && (
                <button
                  onClick={onClearQueue}
                  className="px-3 py-1.5 text-xs text-slate-300 bg-slate-800 border border-slate-700/60 rounded-lg hover:bg-slate-750 transition-all font-medium cursor-pointer"
                >
                  Clear Queue
                </button>
              )}

              {isScrapingActive ? (
                <button
                  onClick={onStopScraper}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-lg flex items-center space-x-1.5 hover:shadow-md transition-all shadow-rose-900/10 animate-pulse cursor-pointer"
                >
                  <StopCircle className="w-4 h-4" />
                  <span>Pause Engine</span>
                </button>
              ) : (
                <button
                  onClick={onStartScraper}
                  disabled={tasks.length === 0}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-605 hover:bg-emerald-500 disabled:opacity-40 rounded-lg flex items-center space-x-1.5 hover:shadow-md transition-all shadow-emerald-900/10 cursor-pointer bg-emerald-600"
                >
                  <PlayCircle className="w-4 h-4" />
                  <span>Start Scraper</span>
                </button>
              )}
            </div>
          </div>

          {/* Queue Scroll List */}
          <div className="flex-1 overflow-y-auto max-h-[220px] border border-slate-800 rounded-2xl bg-slate-950/40">
            {tasks.length === 0 ? (
              <div className="text-slate-500 italic text-xs h-full flex flex-col items-center justify-center p-6 text-center space-y-2">
                <AlertTriangle className="w-8 h-8 text-slate-600" />
                <p>Queue is empty. Enter unlimited Trades & Locations on the left, then click generate!</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-semibold sticky top-0 select-none">
                    <th className="py-2.5 px-4 font-medium text-[10px]">Segment Target</th>
                    <th className="py-2.5 px-4 font-medium text-[10px]">Work Status</th>
                    <th className="py-2.5 px-4 font-medium text-[10px] text-center">Grounding Sites (Crawled)</th>
                    <th className="py-2.5 px-4 font-medium text-[10px] text-center">Leads Extracted</th>
                    <th className="py-2.5 px-4 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850 text-slate-300">
                  {tasks.map((task) => (
                    <tr 
                      key={task.id} 
                      className={`hover:bg-slate-900/50 transition-colors ${
                        task.status === 'processing' ? 'bg-amber-500/5 font-medium' : ''
                      }`}
                    >
                      <td className="py-2 px-4">
                        <span className="font-semibold text-slate-200">{task.trade}</span>
                        <span className="text-slate-500 block text-[10px]">in {task.location}</span>
                      </td>
                      <td className="py-2 px-4">
                        {getStatusBadge(task.status)}
                      </td>
                      <td className="py-2 px-4 text-center font-mono">
                        {task.processedUrlsCount || 0}
                      </td>
                      <td className="py-2 px-4 text-center font-semibold text-indigo-400 font-mono">
                        {task.emailsFoundCount || 0}
                      </td>
                      <td className="py-2 px-4 text-center">
                        <button
                          onClick={() => onDeleteTask(task.id)}
                          className="p-1 text-slate-500 hover:text-rose-400 rounded hover:bg-rose-500/10 transition-colors cursor-pointer"
                          title="Remove Target pairing"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
