import { motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { cn } from '../../App';
import { analysisCardTokens } from './visualTokens';

const viewModeLabels: Record<string, string> = {
  rgb: 'Orijinal',
  pseudo: 'Fizyolojik harita',
  overlay: 'Üst üste görünüm',
  isolated: 'Segmentasyon',
};

export function ImageViewer({ model }: { model: any }) {
  const { currentFrame, currentIndex, setCurrentIndex, data, chartData, viewMode, setViewMode } = model;
  const [overlayMode, setOverlayMode] = useState<'viewport' | 'anchored'>('viewport');
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const frameNotes = useMemo(() => {
    const notes: string[] = [];
    if (currentFrame?.decision?.rationale) notes.push(currentFrame.decision.rationale);
    if (Array.isArray(currentFrame?.errors) && currentFrame.errors.length) {
      notes.push(...currentFrame.errors.map((item: any) => item?.message).filter(Boolean));
    }
    return notes;
  }, [currentFrame]);

  const frameTags = useMemo(() => {
    const tags: string[] = [];
    if (currentFrame?.decision?.status) tags.push(String(currentFrame.decision.status));
    if (currentFrame?.status) tags.push(`QC:${currentFrame.status}`);
    return tags;
  }, [currentFrame]);

  const tooltipSummary = frameNotes.join(' · ') || 'Detay notu bulunmuyor.';

  useEffect(() => {
    setDetailModalOpen(false);
  }, [currentIndex]);

  return (
    <div className={cn(analysisCardTokens.base, 'lg:col-span-3 overflow-hidden flex flex-col relative')}>
      <div className="border-b border-slate-100 bg-white/70 backdrop-blur-sm z-10">
        <div className="px-4 sm:px-6 pt-3 pb-2 border-b border-slate-100/80">
          <div className="flex items-center gap-2 overflow-x-auto">
            {(['rgb', 'pseudo', 'overlay'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={cn(
                  'px-3 sm:px-4 py-2 text-xs sm:text-sm border-b-2 transition-all whitespace-nowrap',
                  viewMode === mode
                    ? 'border-slate-900 text-slate-900 font-semibold'
                    : 'border-transparent text-slate-400 font-medium hover:text-slate-600'
                )}
              >
                {viewModeLabels[mode]}
              </button>
            ))}
          </div>
        </div>
        <div className="px-4 sm:px-6 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="hidden sm:flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Araçlar</span>
              <button
                onClick={() => setViewMode('isolated')}
                className={cn(
                  'px-4 py-2 text-xs font-semibold rounded-xl transition-all border flex items-center gap-2',
                  viewMode === 'isolated'
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                )}
              >
                <Sparkles size={14} />
                Segmentasyon
              </button>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              <span className="text-[11px] font-mono font-semibold text-slate-500 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                SCAN_ID {currentIndex + 1}/{chartData.length}
              </span>
            </div>
            <details className="sm:hidden w-full">
              <summary className="cursor-pointer text-[11px] text-slate-500 font-medium">Meta veriyi göster</summary>
              <div className="mt-2">
                <span className="inline-flex text-[11px] font-mono font-semibold text-slate-500 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                  SCAN_ID {currentIndex + 1}/{chartData.length}
                </span>
              </div>
            </details>
          </div>
          <div className="sm:hidden mt-3">
            <button
              onClick={() => setViewMode('isolated')}
              className={cn(
                'w-full px-4 py-2.5 text-sm font-semibold rounded-xl transition-all border flex items-center justify-center gap-2',
                viewMode === 'isolated'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
              )}
            >
              <Sparkles size={14} />
              Segmentasyon
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 bg-slate-950 relative overflow-hidden flex items-center justify-center min-h-[420px]">
        <div className="absolute inset-0 opacity-[0.015] scientific-grid pointer-events-none z-0" />
        <div className="relative w-full h-full p-8 flex items-center justify-center z-10">
          <div className="absolute inset-4 pointer-events-none rounded-2xl border border-white/10 z-10" />
          <img
            src={currentFrame.image_urls.rgb}
            alt="RGB View"
            className={cn(
              'absolute inset-0 m-auto max-h-full max-w-full object-contain shadow-[0_0_50px_rgba(0,0,0,0.5)] rounded transition-all duration-700 z-10',
              (viewMode === 'pseudo' || viewMode === 'isolated') ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'
            )}
          />
          <img
            src={currentFrame.image_urls.pseudocolor}
            alt="Pseudocolor Analysis"
            className={cn(
              'absolute inset-0 m-auto max-h-full max-w-full object-contain transition-all duration-700 z-20',
              (viewMode === 'pseudo' || viewMode === 'overlay') ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none',
              viewMode === 'overlay' ? 'mix-blend-screen opacity-70' : '',
              viewMode === 'pseudo' && 'brightness-125 contrast-125 hue-rotate-[240deg] saturate-200'
            )}
          />
          <img
            src={currentFrame.image_urls.isolated}
            alt="Isolated Biomass"
            className={cn(
              'absolute inset-0 m-auto max-h-full max-w-full object-contain transition-all duration-700 z-20',
              viewMode === 'isolated' ? 'opacity-100 scale-[1.02] drop-shadow-[0_0_30px_rgba(16,185,129,0.3)]' : 'opacity-0 scale-95 pointer-events-none'
            )}
            style={{ filter: viewMode === 'isolated' ? 'contrast(1.4) brightness(1.1) saturate(1.5)' : 'none' }}
          />
          {viewMode !== 'isolated' && (
            <motion.div
              animate={{ top: ['0%', '100%', '0%'] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
              className="absolute left-0 right-0 h-px bg-primary/40 shadow-[0_0_15px_rgba(37,99,235,0.8)] z-20 pointer-events-none"
            />
          )}
          <div className={cn(
            'z-30 flex flex-col items-end gap-2 pointer-events-auto',
            overlayMode === 'viewport' ? 'absolute top-4 right-4' : 'absolute top-10 right-10'
          )}>
            <div className="bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-2">
              <div className={cn('w-1.5 h-1.5 rounded-full animate-pulse', viewMode === 'rgb' ? 'bg-white' : viewMode === 'pseudo' ? 'bg-rose-500' : 'bg-slate-300')} />
              <span className="text-xs font-bold text-white">{viewModeLabels[viewMode]} aktif</span>
            </div>
            <div className="w-[260px] bg-slate-900/85 backdrop-blur-md p-3 rounded-xl border border-white/10">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[10px] uppercase tracking-wider font-black text-white/70">Info Rail</span>
                <button
                  type="button"
                  onClick={() => setOverlayMode((prev) => (prev === 'viewport' ? 'anchored' : 'viewport'))}
                  className="text-[10px] px-2 py-1 rounded-md border border-white/20 text-white/80 hover:bg-white/10"
                >
                  {overlayMode === 'viewport' ? 'Viewport' : 'Anchor'}
                </button>
              </div>
              <p className="text-[11px] text-white/90 font-semibold">Çekim Tarihi: {currentFrame.timestamp || '-'}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {frameTags.length ? frameTags.map((tag) => (
                  <span key={tag} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-white/85 border border-white/15">{tag}</span>
                )) : <span className="text-[10px] text-white/60">Etiket yok</span>}
              </div>
              <button
                type="button"
                onClick={() => setDetailModalOpen(true)}
                className="group mt-2 w-full text-left text-[11px] text-white/80 hover:text-white"
                title={tooltipSummary}
              >
                <span className="font-semibold">Notlar</span>
                <span className="block truncate max-w-[220px] text-white/70 group-hover:text-white/90">{tooltipSummary}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {detailModalOpen && (
        <div className="absolute inset-0 z-40 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 text-white p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-black uppercase tracking-wide">Frame Notları</h3>
              <button type="button" onClick={() => setDetailModalOpen(false)} className="text-xs px-2 py-1 rounded border border-white/30">Kapat</button>
            </div>
            <div className="space-y-2 text-sm max-h-[320px] overflow-y-auto">
              {frameNotes.length ? frameNotes.map((note, idx) => (
                <p key={`${note}-${idx}`} className="p-2 rounded bg-white/5 border border-white/10">{note}</p>
              )) : <p className="text-white/70">Detay notu bulunmuyor.</p>}
            </div>
          </div>
        </div>
      )}

      <div className="h-[70px] border-t border-slate-100 flex items-center px-8 gap-8 bg-white">
        <div className="flex flex-col gap-1 shrink-0">
          <span className="text-xs font-bold text-slate-400">Sekans İlerlemesi</span>
          <div className="text-xs font-mono font-bold">FRAME_{String(currentIndex + 1).padStart(2, '0')}</div>
        </div>
        <div className="relative flex-1">
          <input
            type="range"
            min="0"
            max={data.timeline.length - 1}
            value={currentIndex}
            onChange={(e) => setCurrentIndex(parseInt(e.target.value))}
            className="w-full h-1 bg-slate-100 rounded-full appearance-none cursor-pointer accent-slate-900"
          />
          <div className="flex justify-between mt-2">
            {data.timeline.map((_: any, i: number) => (
              <div key={i} className={cn('w-0.5 h-1 rounded-full', i <= currentIndex ? 'bg-slate-950' : 'bg-slate-200')} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
