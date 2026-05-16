import { motion } from 'motion/react';
import { BrainCircuit, Loader2, Sparkles } from 'lucide-react';
import { cn } from '../../App';
import { AnalysisCard } from './AnalysisCard';
import { analysisTypography } from './typography';

export function InsightsView({ model }: { model: any }) {
  const { summaryReport, interpretation, interpretationError, isInterpreting } = model;

  return (
    <motion.div key="insights" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col gap-6 max-w-6xl">
      <AnalysisCard>
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <BrainCircuit size={20} className="text-indigo-500" />
              <h2 className="text-xl font-black text-slate-900">Bilimsel Yorum</h2>
            </div>
            <p className="text-sm text-slate-500 font-medium">AI destekli yorum ve deterministik kalite özeti</p>
          </div>
          <span className="px-4 py-2 rounded-2xl bg-indigo-50 text-indigo-700 border border-indigo-100 text-xs font-black">İçgörüler</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {summaryReport.metrics.map((metric: any) => (
            <div key={metric.label} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
              <div className="text-xs font-black text-slate-400 mb-2">{metric.label}</div>
              <div className="text-2xl font-black tabular-nums text-slate-900">{metric.value}</div>
              <p className="text-sm text-slate-500 mt-2 leading-relaxed font-semibold">{metric.detail}</p>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-5 mb-6">
          <div className="flex items-center gap-2 mb-4"><Sparkles size={14} className="text-amber-500" /><h3 className={analysisTypography.cardTitle}>Deterministik Bulgular</h3></div>
          <div className="space-y-2">
            {summaryReport.findings.map((finding: string, index: number) => (
              <div key={index} className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-sm font-semibold leading-relaxed text-slate-700">{finding}</div>
            ))}
          </div>
          <p className="mt-4 text-xs font-bold text-slate-400">
            Bu rapor, AI yorumundan bağımsız olarak {summaryReport.successfulFrames}/{summaryReport.totalFrames} başarılı zaman çizelgesi karesi üzerinden hesaplandı.
          </p>
        </div>

        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-5">
          <h3 className={cn(analysisTypography.cardTitle, 'text-indigo-700 mb-4')}>AI Yorumu</h3>
          {isInterpreting ? (
            <div className="flex flex-col items-center justify-center gap-4 py-10">
              <Loader2 className="animate-spin text-indigo-500" size={28} />
              <p className="text-sm font-semibold text-slate-500">İçgörüler hazırlanıyor...</p>
            </div>
          ) : interpretation ? (
            <div className="prose prose-sm max-w-none whitespace-pre-wrap text-slate-700 font-medium leading-relaxed">{interpretation}</div>
          ) : (
            <p className="text-sm font-semibold leading-relaxed text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-4">
              {interpretationError || 'AI yorumu henüz oluşturulmadı; sekme açıldığında servis çağrısı yapılır.'}
            </p>
          )}
        </div>
      </AnalysisCard>
    </motion.div>
  );
}
