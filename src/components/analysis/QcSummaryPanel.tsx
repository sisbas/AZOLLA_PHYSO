import { motion } from 'motion/react';
import { CheckCircle2, ListChecks } from 'lucide-react';
import { cn } from '../../App';
import { analysisTypography } from './typography';
import { analysisCardTokens, analysisStateTokens } from './visualTokens';

export function QcSummaryPanel({ model }: { model: any }) {
  const { currentFrame, qcRows, qcHasDetailedData, qcSummary, qcStatusNotes, errorSeverityEntries, compositeRisk, qcConfidence, qcConfidenceInterval } = model;
  const confidencePct = typeof qcConfidence === 'number' ? Math.round(qcConfidence * 100) : null;
  const lowConfidence = typeof qcConfidence === 'number' && qcConfidence < 0.6;
  const lighting = currentFrame?.qc?.lighting ?? currentFrame?.context?.lighting ?? currentFrame?.context?.qc?.lighting;
  const lowContrastLighting = lighting?.is_low_contrast === true ? lighting : null;
  const lightingRecommendations = Array.isArray(lowContrastLighting?.recommendation)
    ? lowContrastLighting.recommendation.filter(Boolean)
    : lowContrastLighting?.recommendation
      ? [String(lowContrastLighting.recommendation)]
      : [];
  const lightingAdvice = lightingRecommendations.length > 0
    ? lightingRecommendations.join(' · ')
    : 'Kontrast/ışıklandırma yetersiz görünüyor; daha homojen ışıkta yeniden çekim veya CLAHE/kontrast iyileştirme önerilir.';
  const blendedLabel = (() => {
    const score = compositeRisk?.score;
    if (typeof score !== 'number') return qcSummary.label;
    if (qcSummary.level === 'reliable' && score >= 67) return 'QC iyi ama biyolojik risk artıyor';
    if (qcSummary.level === 'warning' && score >= 67) return 'QC dikkat + biyolojik risk yüksek';
    if (qcSummary.level === 'low' && score <= 33) return 'QC düşük, biyolojik risk sınırlı';
    return `${qcSummary.label} · Risk ${score}/100`;
  })();

  return (
    <motion.div
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={cn(analysisCardTokens.base, 'p-6 relative overflow-hidden')}
    >
      <div className="absolute top-0 right-0 p-4 opacity-[0.04]"><ListChecks size={86} /></div>
      <div className="relative flex items-start justify-between gap-3 mb-5">
        <div>
          <div className="flex items-center gap-2">
            <ListChecks size={14} className="text-slate-500" />
            <h3 className={cn(analysisTypography.sectionLabel, 'text-slate-400')}>QC / Güvenilirlik {confidencePct !== null ? `· Güven %${confidencePct}` : ''}</h3>
          </div>
          <p className="text-sm text-slate-500 mt-1 leading-relaxed">Segmentasyon, maske optimizasyonu ve pipeline durum kontrolü</p>
          {qcConfidenceInterval?.lower !== undefined && qcConfidenceInterval?.upper !== undefined ? (
            <p className="text-xs text-slate-400 mt-1">
              GA95: %{Math.round(qcConfidenceInterval.lower * 100)} - %{Math.round(qcConfidenceInterval.upper * 100)}
            </p>
          ) : null}
        </div>
        <span className={cn(
          'px-3 py-1.5 rounded-full border text-xs font-black shrink-0',
          qcSummary.level === 'reliable' ? analysisStateTokens.success :
            qcSummary.level === 'warning' ? analysisStateTokens.warning :
              analysisStateTokens.danger
        )}>
          {blendedLabel}
        </span>
      </div>

      {!qcHasDetailedData && (
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs font-bold text-slate-500 mb-4">
          Bu pipeline çıktısında QC alanı yok.
        </div>
      )}

      {lowConfidence ? (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs font-bold text-amber-800 mb-4">
          Düşük güven: Bu skorun belirsizliği yüksek, karar öncesi manuel QC doğrulaması önerilir.
        </div>
      ) : null}

      {lowContrastLighting ? (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs font-bold text-amber-800 mb-4">
          <span className="block text-amber-900">Düşük kontrast algılandı: {currentFrame?.filename ?? 'dosya adı yok'}</span>
          <span className="block mt-1 font-semibold">{lightingAdvice}</span>
        </div>
      ) : null}

      <div className="space-y-3 relative">
        {qcRows.map((row: any) => (
          <div key={row.key}>
            <div className="flex items-center justify-between text-xs font-bold mb-1.5">
              <span className="text-slate-500">{row.label}</span>
              <span className={cn(row.ok ? 'text-emerald-600' : 'text-rose-600')}>{row.displayValue}</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className={cn('h-full rounded-full', row.ok ? 'bg-emerald-500' : 'bg-rose-500')} style={{ width: `${row.score}%` }} />
            </div>
            <p className="text-sm text-slate-500 mt-1 leading-relaxed">{row.description}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 space-y-2">
        {qcStatusNotes.map((note: any, index: number) => {
          const text = typeof note === 'string' ? note : note.text;
          const level = typeof note === 'string' ? 'ok' : note.level;
          return (
            <div key={index} className={cn('p-3 rounded-xl border text-sm font-semibold flex gap-2', level === 'ok' ? analysisStateTokens.success : level === 'warning' ? analysisStateTokens.warning : analysisStateTokens.danger)}>
              <CheckCircle2 size={13} className="shrink-0 mt-0.5" />
              <span>{text}</span>
            </div>
          );
        })}
      </div>

      {(currentFrame.errors?.length || errorSeverityEntries.length > 0) ? (
        <div className="mt-5 pt-5 border-t border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-black text-slate-500">Hata ve iyileştirme günlüğü</h4>
            <span className="text-xs tabular-nums text-slate-400">{Array.isArray(currentFrame.errors) ? currentFrame.errors.length : 0} kayıt</span>
          </div>
          {errorSeverityEntries.length > 0 ? (
            <div className="space-y-2">
              {errorSeverityEntries.map(([severity, errors]: [string, any[]]) => (
                <div key={severity} className="rounded-xl border border-slate-100 bg-white p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className={cn(
                      'px-2 py-0.5 rounded text-xs font-black',
                      ['critical', 'error'].includes(severity) ? 'bg-rose-100 text-rose-700' :
                        ['warning', 'warn'].includes(severity) ? 'bg-amber-100 text-amber-700' :
                          'bg-slate-100 text-slate-600'
                    )}>{['critical', 'error'].includes(severity) ? 'Hata' : ['warning', 'warn'].includes(severity) ? 'Uyarı' : severity}</span>
                    <span className="text-xs tabular-nums text-slate-400">{errors.length} adet</span>
                  </div>
                  <div className="space-y-1.5">
                    {errors.map((error: any, index: number) => (
                      <div key={`${severity}-${index}`} className="text-xs leading-relaxed text-slate-600 border-l-2 border-slate-100 pl-2">
                        <span className="font-bold text-slate-800">{error?.message ?? 'Mesaj yok'}</span>
                        {error?.remediation ? <span className="block text-slate-400 italic">{error.remediation}</span> : null}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={cn('p-3 rounded-xl border text-xs font-bold', analysisStateTokens.success)}>
              Önem düzeyi gruplarında hata kaydı yok.
            </div>
          )}
        </div>
      ) : null}
    </motion.div>
  );
}
