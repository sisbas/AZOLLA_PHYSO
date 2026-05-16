import { AnimatePresence, motion } from 'motion/react';
import { Activity, AlertCircle } from 'lucide-react';
import { cn } from '../../App';
import { AnalysisSidebar } from './AnalysisSidebar';
import { BatchStatsView } from './BatchStatsView';
import { ExportPanel } from './ExportPanel';
import { FrameComparisonPanel } from './FrameComparisonPanel';
import { ImageViewer } from './ImageViewer';
import { InsightsView } from './InsightsView';
import { PhenotypingSummary } from './PhenotypingSummary';
import { QcSummaryPanel } from './QcSummaryPanel';

function DecisionPanel({ model }: { model: any }) {
  const {
    currentFrame,
    decisionProbability,
    decisionWeightsFromApi,
    decisionContributionRows,
    formatDecisionValue,
  } = model;

  return (
    <motion.div
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="bg-white border border-[#e2e8f0] rounded-2xl p-6 flex flex-col shadow-xl shadow-slate-200/40 relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 p-4 opacity-[0.05]"><Activity size={80} /></div>
      <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-6">Physio_Logic Core</h3>

      <div className="flex flex-col gap-2 mb-6">
        <div className="flex items-center justify-between gap-2">
          <span className={cn(
            'px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest',
            currentFrame.decision?.status === 'HEALTHY' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'
          )}>
            {currentFrame.decision?.status ?? 'UNKNOWN'}
          </span>
          <span className="text-[9px] font-bold text-slate-300">early_stress_prob</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-5xl font-black font-mono tracking-tighter text-slate-900">
            {decisionProbability === null ? '—' : Math.round(decisionProbability * 100)}<span className="text-2xl text-slate-300">%</span>
          </span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Karar olasılığı</span>
        </div>
      </div>

      <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 mb-6">
        <p className="text-[11px] leading-relaxed font-semibold text-slate-600">
          {currentFrame.decision?.rationale ?? 'Karar gerekçesi bulunamadı.'}
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="text-[9px] font-black uppercase tracking-widest text-slate-500">Karar katkıları</h4>
            <p className="text-[9px] text-slate-400 mt-1">
              {decisionWeightsFromApi ? 'Backend decision.early_weights ağırlıkları kullanılıyor.' : 'Yaklaşık katkı: backend ağırlıkları API yanıtında bulunamadı.'}
            </p>
          </div>
          <span className={cn(
            'px-2 py-1 rounded-lg border text-[8px] font-bold uppercase tracking-wider',
            decisionWeightsFromApi ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-amber-50 text-amber-700 border-amber-100'
          )}>
            {decisionWeightsFromApi ? 'API ağırlığı' : 'Yaklaşık katkı'}
          </span>
        </div>

        {decisionContributionRows.map((row: any) => (
          <div key={row.key} className="space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-[10px]">
              <div>
                <span className="font-bold text-slate-700">{row.label}</span>
                <span className="text-slate-400"> · {row.description}</span>
              </div>
              <div className="font-mono text-slate-500 text-right">
                <span>{formatDecisionValue(row.contributionValue, 3)}</span>
                <span className="text-slate-300"> / w:{row.weight.toFixed(2)}</span>
              </div>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className={cn('h-full rounded-full', row.color)} style={{ width: `${row.barWidth}%` }} />
            </div>
            <div className="flex justify-between text-[8px] text-slate-400 font-mono">
              <span>değer: {formatDecisionValue(row.rawValue, row.digits)}</span>
              <span>sinyal: {formatDecisionValue(row.signalValue, 3)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 mt-8">
        <div className="bg-white border border-slate-100 p-3 rounded-xl shadow-sm">
          <div className="text-[8px] font-bold text-slate-400 uppercase mb-1 tracking-widest">Frond_Density</div>
          <div className="text-lg font-bold font-mono text-slate-900">{currentFrame.metrics.frond_count}</div>
        </div>
        <div className="bg-white border border-slate-100 p-3 rounded-xl shadow-sm">
          <div className="text-[8px] font-bold text-slate-400 uppercase mb-1 tracking-widest">Area_Cov</div>
          <div className="text-lg font-bold font-mono text-slate-900">{currentFrame.metrics.coverage_pct.toFixed(1)}<span className="text-xs text-slate-300">%</span></div>
        </div>
      </div>

      <div className="mt-5 flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl">
        <AlertCircle size={14} className="text-amber-600 mt-0.5 shrink-0" />
        <p className="text-[10px] leading-relaxed font-semibold text-amber-800">Korelasyon ≠ nedensellik; biyokimyasal validasyon gerekir.</p>
      </div>
    </motion.div>
  );
}

function AnalysisTab({ model }: { model: any }) {
  return (
    <motion.div key="analysis" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col gap-6">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1 max-h-[70vh]">
        <ImageViewer model={model} />
        <div className="flex flex-col gap-6">
          <DecisionPanel model={model} />
          <QcSummaryPanel model={model} />
          <ExportPanel model={model} />
        </div>
      </div>
      <FrameComparisonPanel model={model} />
      <PhenotypingSummary model={model} />
    </motion.div>
  );
}

export function AnalysisLayout({ model }: { model: any }) {
  return (
    <div className="grid grid-cols-12 h-screen overflow-hidden bg-[#f8fafc] scientific-grid">
      <AnalysisSidebar model={model} />
      <main className="col-span-9 lg:col-span-10 p-6 flex flex-col gap-6 overflow-y-auto">
        <AnimatePresence mode="wait">
          {model.activeTab === 'analysis' ? <AnalysisTab model={model} /> : model.activeTab === 'insights' ? <InsightsView model={model} /> : <BatchStatsView model={model} />}
        </AnimatePresence>
      </main>
    </div>
  );
}
