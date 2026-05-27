import { Layers } from 'lucide-react';
import { cn } from '../../App';
import { AnalysisCard } from './AnalysisCard';
import { analysisTypography } from './typography';

const compareViewModeLabels: Record<string, string> = {
  rgb: 'Orijinal',
  pseudo: 'Fizyolojik harita',
  overlay: 'Üst üste',
  isolated: 'Segmentasyon',
};

export function FrameComparisonPanel({ model }: { model: any }) {
  const {
    data,
    compareStartIndex,
    compareEndIndex,
    setCompareStartIndex,
    setCompareEndIndex,
    compareViewMode,
    setCompareViewMode,
    compareStartFrame,
    compareEndFrame,
    compareTimeDeltaLabel,
    compareRows,
    compareValidation,
    comparePrimaryDelta,
    getCompareImageUrl,
    formatFrameDateLabel,
    formatCompareValue,
    formatSignedNumber,
    formatPercentChange,
  } = model;

  return (
    <AnalysisCard className="shadow-slate-200/30">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
          <div>
            <h3 className={cn(analysisTypography.cardTitle, 'mb-1')}>Kare Karşılaştırma</h3>
            <p className="text-sm text-slate-500 leading-relaxed">Başlangıç ve bitiş kareleri arasında fenotipik değişim</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['rgb', 'pseudo', 'overlay', 'isolated'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setCompareViewMode(mode)}
                className={cn(
                  'px-3 py-2 rounded-xl text-xs font-black border transition-all',
                  compareViewMode === mode ? 'bg-slate-900 text-white border-slate-900 shadow-lg' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                )}
              >
                {compareViewModeLabels[mode]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[
            { label: 'Başlangıç karesi', value: compareStartIndex, setter: setCompareStartIndex, color: 'accent-slate-900' },
            { label: 'Bitiş karesi', value: compareEndIndex, setter: setCompareEndIndex, color: 'accent-emerald-600' },
          ].map((control) => (
            <div key={control.label} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-black text-slate-400">{control.label}</span>
                <span className="text-xs font-mono font-black text-slate-800">FRAME_{String(control.value + 1).padStart(2, '0')}</span>
              </div>
              <input
                type="range"
                min="0"
                max={data.timeline.length - 1}
                value={control.value}
                onChange={(event) => control.setter(parseInt(event.target.value))}
                className={cn('w-full h-1 bg-slate-200 rounded-full appearance-none cursor-pointer', control.color)}
              />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {[
            { label: 'Başlangıç', frame: compareStartFrame, index: compareStartIndex },
            { label: 'Bitiş', frame: compareEndFrame, index: compareEndIndex },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl overflow-hidden bg-slate-950 border border-slate-900 min-h-[220px] relative">
              <div className="absolute top-3 left-3 z-10 rounded-xl bg-black/60 px-3 py-2 backdrop-blur-md border border-white/10">
                <span className="block text-xs font-black text-white">{item.label} · FRAME_{String(item.index + 1).padStart(2, '0')}</span>
                <span className="mt-1 block truncate text-xs font-semibold text-white/60">{formatFrameDateLabel(item.frame)}</span>
              </div>
              {getCompareImageUrl(item.frame, compareViewMode) ? (
                <img src={getCompareImageUrl(item.frame, compareViewMode)} alt={`${item.label} comparison`} className="absolute inset-0 h-full w-full object-contain p-4" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white/40">Görüntü yok</div>
              )}
            </div>
          ))}

          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-5 flex flex-col justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2"><Layers size={14} className="text-emerald-600" /><span className="text-xs font-black text-emerald-700">Değişim Özeti</span></div>
              <div className="text-3xl font-black tabular-nums text-slate-900">{formatSignedNumber(comparePrimaryDelta?.delta ?? null, 1, comparePrimaryDelta?.unit ?? '')}</div>
              <p className="text-sm font-semibold text-slate-500 mt-1">{comparePrimaryDelta?.label ?? 'Birincil metrik'} · {compareTimeDeltaLabel}</p>
            </div>
            {compareValidation?.hasMissingMetrics ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <p className="font-black mb-1">Eksik metrik tespit edildi</p>
                <p className="font-semibold">Başlangıç: {compareValidation.start.availableMetricCount}/{compareValidation.start.totalMetricCount} metrik dolu</p>
                <p className="font-semibold">Bitiş: {compareValidation.end.availableMetricCount}/{compareValidation.end.totalMetricCount} metrik dolu</p>
              </div>
            ) : null}
            <div className="space-y-3">
              {compareRows.map((row: any) => (
                <div key={row.key} className="rounded-xl bg-white border border-white p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-slate-500">{row.label}</span>
                      {row.estimated ? (
                        <span
                          className="rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-black text-amber-700"
                          title={row.estimateTooltip ?? 'Bu değer tahmini fallback hesaplamasıdır.'}
                        >
                          estimated
                        </span>
                      ) : null}
                    </div>
                    <span className={cn('text-xs tabular-nums font-black', row.delta === null ? 'text-slate-400' : row.delta >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                      {formatSignedNumber(row.delta, row.digits, row.unit)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs tabular-nums text-slate-400">
                    <span>{formatCompareValue(row.startValue, row)}</span>
                    <span>{formatCompareValue(row.endValue, row)}</span>
                    <span>{formatPercentChange(row.percentChange)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AnalysisCard>
  );
}
