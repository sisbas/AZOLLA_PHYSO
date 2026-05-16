import React, { useState, useEffect } from 'react';
import { FlaskConical, History, Microscope } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import Dashboard from './components/Dashboard';
import UploadPanel from './components/UploadPanel';
import SettingsView from './components/SettingsView';
import PhenotypingView from './components/PhenotypingView';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type ViewState = 'upload' | 'analysis' | 'phenotyping' | 'settings';

const isViewState = (view: unknown): view is ViewState =>
  view === 'upload' || view === 'analysis' || view === 'phenotyping' || view === 'settings';

export default function App() {
  const [view, setView] = useState<ViewState>('upload');
  const [taskId, setTaskId] = useState<string | null>(null);
  useEffect(() => {
    const handleViewChange = (e: any) => {
      if (isViewState(e.detail)) setView(e.detail);
    };
    window.addEventListener('change-view', handleViewChange);
    return () => window.removeEventListener('change-view', handleViewChange);
  }, []);

  const handleUploadComplete = (id: string) => {
    setTaskId(id);
    setView('analysis');
  };

  const renderView = () => {
    switch (view) {
      case 'upload':
        return (
          <motion.div
            key="upload"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="p-8"
          >
            <UploadPanel onComplete={handleUploadComplete} />
          </motion.div>
        );
      case 'analysis':
        return (
          <motion.div
            key="analysis"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-full"
          >
            <Dashboard taskId={taskId!} />
          </motion.div>
        );
      case 'phenotyping':
        return (
          <motion.div
            key="phenotyping"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-full"
          >
            <PhenotypingView />
          </motion.div>
        );
      case 'settings':
        return (
          <motion.div
            key="settings"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="p-8"
          >
            <SettingsView />
          </motion.div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans selection:bg-slate-900 selection:text-white scientific-grid">
      {/* Header */}
      <header className="h-[64px] border-b border-slate-200 flex items-center justify-between bg-white/80 backdrop-blur-xl px-8 sticky top-0 z-50 shadow-sm shadow-slate-200/50">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3 group cursor-pointer" onClick={() => setView('upload')}>
            <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white shadow-xl shadow-slate-900/20 group-hover:scale-110 transition-transform">
              <FlaskConical size={20} />
            </div>
            <div className="flex flex-col">
              <h1 className="font-black text-lg tracking-tighter leading-none uppercase">Azolla_Physio</h1>
              <span className="text-[9px] font-bold text-slate-400 tracking-[0.2em] mt-1">BIOMETRIC_ENGINE v1.2</span>
            </div>
          </div>
          
          <div className="h-8 w-px bg-slate-100 mx-2" />
          
          <nav className="flex items-center gap-1">
            <button 
              onClick={() => setView('upload')}
              className={cn(
                "px-5 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all",
                view === 'upload' ? "bg-slate-100 text-slate-900 shadow-inner" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
              )}
            >
              Laboratuvar
            </button>
            <button 
              disabled={!taskId}
              onClick={() => setView('analysis')}
              className={cn(
                "px-5 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all",
                view === 'analysis' ? "bg-slate-100 text-slate-900 shadow-inner" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50",
                !taskId && "opacity-20 cursor-not-allowed"
              )}
            >
              Analiz
            </button>
            <button 
              onClick={() => setView('phenotyping')}
              className={cn(
                "px-5 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all",
                view === 'phenotyping' ? "bg-emerald-100 text-emerald-700 shadow-inner" : "text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
              )}
            >
              <span className="flex items-center gap-2">
                <Microscope size={12} />
                Fenotipleme
              </span>
            </button>
            <button 
              onClick={() => setView('settings')}
              className={cn(
                "px-5 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all",
                view === 'settings' ? "bg-slate-100 text-slate-900 shadow-inner" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
              )}
            >
              Ayarlar
            </button>
          </nav>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="hidden lg:flex flex-col items-end">
            <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest leading-none mb-1">System_Response</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-tight">Nominal</span>
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
            </div>
          </div>
          <div className="h-8 w-px bg-slate-100" />
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400">
               <History size={14} />
             </div>
             <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center shadow-lg shadow-slate-900/30">
               <span className="text-[10px] font-black uppercase tracking-tighter">AA</span>
             </div>
          </div>
        </div>
      </header>

      <main className={cn(
        "mx-auto min-h-[calc(100vh-64px)]",
        view === 'analysis' || view === 'phenotyping' ? "w-full" : "max-w-[1400px]"
      )}>
        <AnimatePresence mode="wait">
          {renderView()}
        </AnimatePresence>
      </main>
    </div>
  );
}
