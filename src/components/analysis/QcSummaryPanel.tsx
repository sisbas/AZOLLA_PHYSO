import { motion } from 'motion/react';
import { CheckCircle2, ListChecks } from 'lucide-react';
import { cn } from '../../App';

export function QcSummaryPanel({ model }: { model: any }) {
  const { currentFrame, qcRows, qcHasDetailedData, qcSummary, qcStatusNotes, errorSeverityEntries } = model;

  return (
    <motion.div
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xl shadow-slate-200/40 relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 p-4 opacity-[0.04]"><ListChecks size={86} /></div>
      <div className="relative flex items-start justify-between gap-3 mb-5">
        <div>
          <div className="flex items-center gap-2">
            <ListChecks size={14} className="text-slate-500" />
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">QC / Güvenilirlik</h3>
          </div>
          <p className="text-[9px] text-slate-400 mt-1">Segmentasyon, maske optimizasyonu ve pipeline durum kontrolü</p>
        </div>
        <span className={cn(
          'px-3 py-1.5 rounded-full border text-[9px] font-black uppercase tracking-widest shrink-0',
          qcSummary.level === 'reliable' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
            qcSummary.level === 'warning' ? 'bg-amber-50 text-amber-700 border-amber-100' :
              'bg-rose-50 text-rose-700 border-rose-100'
        )}>
          {qcSummary.label}
        </span>
      </div>

      {!qcHasDetailedData && (
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-[10px] font-bold text-slate-500 mb-4">
          Bu pipeline çıktısında QC alanı yok.
        </div>
      )}

      <div className="space-y-3 relative">
        {qcRows.map((row: any) => (
          <div key={row.key}>
            <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider mb-1.5">
              <span className="text-slate-500">{row.label}</span>
              <span className={cn(row.ok ? 'text-emerald-600' : 'text-rose-600')}>{row.displayValue}</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className={cn('h-full rounded-full', row.ok ? 'bg-emerald-500' : 'bg-rose-500')} style={{ width: `${row.score}%` }} />
            </div>
            <p className="text-[8px] text-slate-400 mt-1 leading-relaxed">{row.description}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 space-y-2">
        {qcStatusNotes.map((note: any, index: number) => {
          const text = typeof note === 'string' ? note : note.text;
          const level = typeof note === 'string' ? 'ok' : note.level;
          return (
            <div key={index} className={cn('p-3 rounded-xl border text-[10px] font-bold flex gap-2', level === 'ok' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : level === 'warning' ? 'bg-amber-50 border-amber-100 text-amber-700' : 'bg-rose-50 border-rose-100 text-rose-700')}>
              <CheckCircle2 size={13} className="shrink-0 mt-0.5" />
              <span>{text}</span>
            </div>
          );
        })}
      </div>

      {(currentFrame.errors?.length || errorSeverityEntries.length > 0) ? (
        <div className="mt-5 pt-5 border-t border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-[9px] font-black uppercase tracking-widest text-slate-500">Hata / Remediation Günlüğü</h4>
            <span className="text-[8px] font-mono text-slate-400">{Array.isArray(currentFrame.errors) ? currentFrame.errors.length : 0} kayıt</span>
          </div>
          {errorSeverityEntries.length > 0 ? (
            <div className="space-y-2">
              {errorSeverityEntries.map(([severity, errors]: [string, any[]]) => (
                <div key={severity} className="rounded-xl border border-slate-100 bg-white p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className={cn(
                      'px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider',
                      ['critical', 'error'].includes(severity) ? 'bg-rose-100 text-rose-700' :
                        ['warning', 'warn'].includes(severity) ? 'bg-amber-100 text-amber-700' :
                          'bg-slate-100 text-slate-600'
                    )}>{severity}</span>
                    <span className="text-[8px] font-mono text-slate-400">{errors.length} adet</span>
                  </div>
                  <div className="space-y-1.5">
                    {errors.map((error: any, index: number) => (
                      <div key={`${severity}-${index}`} className="text-[9px] leading-relaxed text-slate-600 border-l-2 border-slate-100 pl-2">
                        <span className="font-bold text-slate-800">{error?.message ?? 'Mesaj yok'}</span>
                        {error?.remediation ? <span className="block text-slate-400 italic">{error.remediation}</span> : null}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-3 rounded-xl border border-emerald-100 bg-emerald-50 text-[10px] font-bold text-emerald-700">
              Severity gruplarında hata kaydı yok.
            </div>
          )}
        </div>
      ) : null}
    </motion.div>
  );
}
