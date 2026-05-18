import { Download, Layers } from 'lucide-react';
import { cn } from '../../App';
import { analysisTypography } from './typography';
import { analysisCardTokens } from './visualTokens';

export function ExportPanel({ model }: { model: any }) {
  const { setViewMode, handleDownload, downloadCsv } = model;

  return (
    <div className={cn(analysisCardTokens.base, 'bg-slate-900 border-slate-800 text-white p-6 space-y-6 relative overflow-hidden')}>
      <div className="absolute inset-0 pointer-events-none opacity-20 scientific-grid" />
      <div className="space-y-4 relative">
        <div className="flex items-center gap-2">
          <Download size={14} className="text-primary" />
          <h4 className={cn(analysisTypography.sectionLabel, 'text-slate-400')}>Dışa Aktarma</h4>
        </div>
        <div className="grid grid-cols-1 gap-2">
          {[
            { mode: 'rgb', title: 'Orijinal görüntü', detail: 'Raw RGB · ham spektrum' },
            { mode: 'pseudo', title: 'Fizyolojik harita', detail: 'Physio Map · sahte renk analizi' },
          ].map((item) => (
            <button
              key={item.mode}
              onClick={() => { setViewMode(item.mode); handleDownload(item.mode); }}
              className="group flex items-center justify-between gap-3 p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/20 transition-all text-left"
            >
              <div className="flex flex-col">
                <span className={analysisTypography.label}>{item.title}</span>
                <span className="text-sm text-white/50">{item.detail}</span>
              </div>
              <span className="shrink-0 inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-black text-white">
                <Download size={13} /> PNG indir
              </span>
            </button>
          ))}
        </div>
      </div>
      <button onClick={downloadCsv} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-4 rounded-xl flex items-center justify-center gap-3 transition-all relative z-10">
        <Layers size={14} /> Tüm batch raporunu (CSV) indir
      </button>
    </div>
  );
}
