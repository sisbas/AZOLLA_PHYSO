import { motion } from 'motion/react';
import { BarChart3, BrainCircuit, Database, Layers, Maximize2, Zap } from 'lucide-react';
import { cn } from '../../App';

export function AnalysisSidebar({ model }: { model: any }) {
  const { currentFrame, activeTab, setActiveTab } = model;

  return (
    <aside className="col-span-3 lg:col-span-2 border-r border-[#e2e8f0] flex flex-col bg-white/80 backdrop-blur-md p-5 gap-6 overflow-y-auto">
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Database size={14} className="text-primary" />
          <h3 className="text-[10px] font-bold text-[#64748b] uppercase tracking-[0.15em]">Envanter Verisi</h3>
        </div>
        <div className="grid gap-4">
          <div className="group">
            <span className="text-[9px] uppercase text-slate-400 font-bold tracking-tighter">Numune Tanımlayıcı</span>
            <p className="text-xs font-mono font-bold text-slate-800 bg-slate-50 p-2 rounded-md border border-slate-100 group-hover:border-primary/20 transition-colors">AZ_PINN_04</p>
          </div>
          <div>
            <span className="text-[9px] uppercase text-slate-400 font-bold tracking-tighter">İzleme Periyodu</span>
            <p className="text-xs font-semibold text-slate-700">2023-08-01 — 2023-08-21</p>
          </div>
          <div>
            <span className="text-[9px] uppercase text-slate-400 font-bold tracking-tighter">Mikroklima</span>
            <p className="text-xs font-semibold text-slate-700">Ünite B-7 (Stresli Grup)</p>
            <div className="flex gap-1.5 mt-1.5">
              <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[9px] font-bold border border-blue-100">28°C</span>
              <span className="px-1.5 py-0.5 bg-cyan-50 text-cyan-600 rounded text-[9px] font-bold border border-cyan-100">75% RH</span>
            </div>
          </div>
        </div>
      </div>

      <div className="pt-6 border-t border-slate-100">
        <div className="flex items-center gap-2 mb-4">
          <Zap size={14} className="text-warning" />
          <h3 className="text-[10px] font-bold text-[#64748b] uppercase tracking-[0.15em]">Tanı Kaydı</h3>
        </div>
        <div className="space-y-3">
          {currentFrame.errors && currentFrame.errors.length > 0 ? (
            currentFrame.errors.map((error: any, idx: number) => (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                key={idx}
                className={cn(
                  'p-3 rounded-xl border flex flex-col gap-1.5 shadow-sm',
                  error.severity === 'error' ? 'bg-rose-50 border-rose-100' : 'bg-amber-50 border-amber-100'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className={cn(
                    'text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded',
                    error.severity === 'error' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                  )}>
                    {error.severity}
                  </span>
                  <span className="text-[8px] font-mono opacity-40">STEP_{idx + 1}</span>
                </div>
                <p className="text-[10px] font-bold leading-tight text-slate-800">{error.message}</p>
                <p className="text-[9px] text-slate-500 italic border-l-2 border-slate-200 pl-2 leading-relaxed">{error.remediation}</p>
              </motion.div>
            ))
          ) : (
            <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-tight">Sinyal Stabil</span>
            </div>
          )}
        </div>
      </div>

      <div className="pt-6 border-t border-slate-100 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Layers size={14} className="text-primary" />
          <h3 className="text-[10px] font-bold text-[#64748b] uppercase tracking-[0.15em]">Görünüm Seçimi</h3>
        </div>
        <div className="grid gap-2">
          {[
            { key: 'analysis', label: 'Kare Analizi', icon: Maximize2 },
            { key: 'stats', label: 'Batch İstatistikleri', icon: BarChart3 },
            { key: 'insights', label: 'Bilimsel Yorum', icon: BrainCircuit },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left',
                activeTab === key ? 'bg-slate-900 text-white shadow-lg' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              )}
            >
              <Icon size={16} />
              <span className="text-[11px] font-bold uppercase tracking-tight">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-auto pt-6 border-t border-slate-100">
        <div className="p-4 bg-slate-900 rounded-xl space-y-4 shadow-xl">
          <div className="flex justify-between items-center">
            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Analiz Modu</span>
            <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
          </div>
          <div className="text-xs font-bold text-white tracking-tight">
            {currentFrame.status === 'failed' ? 'Kesinti' : 'Azolla_Physio_v1'}
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-[9px] font-bold uppercase text-slate-500">
              <span>İşleme Gücü</span>
              <span>{currentFrame.status === 'optimized' ? '100%' : '75%'}</span>
            </div>
            <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: currentFrame.status === 'optimized' ? '100%' : '75%' }}
                className="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
              />
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
