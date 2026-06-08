import React, { useEffect, useRef } from 'react';
import { Terminal, ShieldCheck, HelpCircle } from 'lucide-react';
import { ScraperLog } from '../types.js';

interface ConsoleLogsProps {
  logs: ScraperLog[];
}

export default function ConsoleLogs({ logs }: ConsoleLogsProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to top (newest logs on top) or keep to default
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [logs]);

  return (
    <div id="console-logs-card" className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col h-[320px]">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
        <div className="flex items-center space-x-2">
          <Terminal className="text-emerald-400 w-5 h-5 animate-pulse" />
          <h3 className="font-mono text-sm font-semibold text-slate-200">Real-Time Scraper Console</h3>
        </div>
        <div className="flex items-center space-x-2 text-xs font-mono text-slate-500">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>In-Memory Extraction Active (Safe)</span>
        </div>
      </div>

      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto font-mono text-xs space-y-1.5 pr-2 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent scroll-smooth"
      >
        {logs.length === 0 ? (
          <div className="text-slate-500 italic flex flex-col items-center justify-center h-full space-y-2">
            <HelpCircle className="w-8 h-8 opacity-40 text-slate-600" />
            <p>Scraper console ready. Import trades, locations & click Start Scraper above!</p>
          </div>
        ) : (
          logs.map((log) => {
            let colorClass = 'text-slate-300';
            let bgClass = 'bg-slate-900 border-slate-800';

            if (log.level === 'success') {
              colorClass = 'text-emerald-400';
            } else if (log.level === 'warn') {
              colorClass = 'text-amber-400';
            } else if (log.level === 'error') {
              colorClass = 'text-rose-400 font-semibold';
            } else if (log.level === 'info') {
              colorClass = 'text-sky-300';
            }

            return (
              <div 
                key={log.id} 
                className={`py-1 px-2.5 rounded border ${bgClass} leading-relaxed transition-all duration-300 hover:bg-slate-900/60 flex items-start space-x-2`}
              >
                <span className="text-slate-600 select-none text-[10px] mt-0.5">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className={`${colorClass} flex-1 break-all`}>
                  {log.message}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
