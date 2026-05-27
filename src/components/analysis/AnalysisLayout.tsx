import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
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
import { analysisTypography } from './typography';
import { analysisStateTokens } from './visualTokens';

function TopMetricsRow({ model }: { model: any }) {
  const stressProbability = model.decisionProbability === null ? '—' : `${Math.round(model.decisionProbability * 100)}%`;
  const coverage = typeof model.currentFrame.metrics?.coverage_pct === 'number'
    ? `${model.currentFrame.metrics.coverage_pct.toFixed(1)}%`
    : '—';
  const frondCount = model.currentFrondCount === null ? '—' : model.currentFrondCount.toFixed(0);
  const qcLabel = model.qcSummary?.label ?? 'QC bilinmiyor';
  const riskIndex = typeof model.compositeRisk?.score === 'number' ? `${model.compositeRisk.score}/100` : '—';
  const qcLevel = model.qcSummary?.level ?? 'unknown';
  const riskBand = model.compositeRisk?.band ?? 'unknown';

  const getStatusTone = (status?: string) => {
    if (status === 'success') return 'text-[var(--color-success-700)]';
    if (status === 'warning') return 'text-[var(--color-warning-700)]';
    if (status === 'critical') return 'text-[var(--color-danger-700)]';
    return 'text-[var(--color-text-primary)]';
  };

  const getChipTone = (status?: string) => {
    if (status === 'success') return analysisStateTokens.success;
    if (status === 'warning') return analysisStateTokens.warning;
    if (status === 'critical') return analysisStateTokens.danger;
    return 'bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)] border-[var(--color-border)]';
  };

  const cards = [
    { label: 'Stres olasılığı', value: stressProbability, status: 'warning' as const },
    { label: 'Kapsama', value: coverage, status: 'success' as const },
    { label: 'Frond sayısı', value: frondCount, status: 'success' as const },
    {
      label: 'QC durumu',
      value: qcLabel,
      status: qcLevel === 'reliable' ? 'success' as const : qcLevel === 'warning' ? 'warning' as const : qcLevel === 'low' ? 'critical' as const : undefined,
      chipLabel: qcLevel === 'reliable' ? 'Başarılı' : qcLevel === 'warning' ? 'Uyarı' : qcLevel === 'low' ? 'Kritik' : 'Bilinmiyor',
    },
    {
      label: 'Risk Endeksi',
      value: riskIndex,
      status: riskBand === 'high' ? 'critical' as const : riskBand === 'medium' ? 'warning' as const : riskBand === 'low' ? 'success' as const : undefined,
      chipLabel: riskBand === 'high' ? 'Kritik' : riskBand === 'medium' ? 'Uyarı' : riskBand === 'low' ? 'Başarılı' : 'Bilinmiyor',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 md:gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="group rounded-xl border border-slate-200 bg-white px-4 md:px-5 py-4 md:py-5 min-h-[124px] shadow-sm transition-colors transition-shadow duration-150 hover:shadow-md hover:border-slate-300 focus-within:shadow-md focus-within:border-sky-300"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs md:text-sm font-medium text-slate-600">{card.label}</p>
            {card.chipLabel ? (
              <span className={cn('px-2 py-0.5 rounded-full border text-[11px] font-bold leading-5', getChipTone(card.status))}>
                {card.chipLabel}
              </span>
            ) : null}
          </div>
          <p className={cn(analysisTypography.kpiValue, 'mt-3', getStatusTone(card.status))}>{card.value}</p>
        </div>
      ))}
    </div>
  );
}

function CollapsibleCard({ title, description, children, defaultOpen = false }: { title: string; description: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="bg-white border border-slate-200 rounded-2xl shadow-sm group" open={defaultOpen}>
      <summary className="list-none cursor-pointer px-5 py-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-slate-800">{title}</h3>
          <p className="text-xs text-slate-500 mt-1">{description}</p>
        </div>
        <span className="text-xs font-semibold text-slate-400 group-open:rotate-180 transition-transform">⌄</span>
      </summary>
      <div className="px-5 pb-5">
        {children}
      </div>
    </details>
  );
}

function DecisionPanel({ model }: { model: any }) {
  const {
    currentFrame,
    decisionProbability,
    compositeRisk,
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
      <h3 className={cn(analysisTypography.sectionLabel, 'text-slate-400 mb-6')}>Physio_Logic Core</h3>

      <div className="flex flex-col gap-2 mb-6">
        <div className="flex items-center justify-between gap-2">
          <span className={cn(
            'px-3 py-1 rounded-full text-xs font-bold',
            currentFrame.decision?.status === 'HEALTHY' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'
          )}>
            {currentFrame.decision?.status === 'HEALTHY' ? 'Sağlıklı' : currentFrame.decision?.status === 'STRESSED' ? 'Stresli' : 'Bilinmiyor'}
          </span>
          <span className="text-xs font-bold text-slate-400">Erken stres olasılığı</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-5xl font-black tabular-nums tracking-tighter text-slate-900">
            {decisionProbability === null ? '—' : Math.round(decisionProbability * 100)}<span className="text-2xl text-slate-300">%</span>
          </span>
          <span className="text-xs font-bold text-slate-400">Karar olasılığı</span>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
          <span className="text-xs font-bold text-slate-500">Risk Endeksi</span>
          <span className={cn(
            'text-sm font-black tabular-nums',
            compositeRisk?.band === 'high' ? 'text-rose-600' : compositeRisk?.band === 'medium' ? 'text-amber-600' : 'text-emerald-600'
          )}>
            {typeof compositeRisk?.score === 'number' ? `${compositeRisk.score}/100 (${compositeRisk.label})` : '—'}
          </span>
        </div>
      </div>

      <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 mb-6">
        <p className="text-sm leading-relaxed font-semibold text-slate-600">
          {currentFrame.decision?.rationale ?? 'Karar gerekçesi bulunamadı.'}
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className={cn(analysisTypography.sectionLabel, "font-black text-slate-500")}>Karar katkıları</h4>
            <p className="text-sm text-slate-500 mt-1 leading-relaxed">
              {decisionWeightsFromApi ? 'Backend decision.early_weights ağırlıkları kullanılıyor.' : 'Yaklaşık katkı: backend ağırlıkları API yanıtında bulunamadı.'}
            </p>
          </div>
          <span className={cn(
            'px-2 py-1 rounded-lg border text-xs font-bold',
            decisionWeightsFromApi ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-amber-50 text-amber-700 border-amber-100'
          )}>
            {decisionWeightsFromApi ? 'API ağırlığı' : 'Yaklaşık katkı'}
          </span>
        </div>

        {decisionContributionRows.map((row: any) => (
          <div key={row.key} className="space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-xs">
              <div>
                <span className="font-bold text-slate-700">{row.label}</span>
                <span className="text-slate-400"> · {row.description}</span>
              </div>
              <div className="tabular-nums text-slate-500 text-right">
                <span>{formatDecisionValue(row.contributionValue, 3)}</span>
                <span className="text-slate-300"> / w:{row.weight.toFixed(2)}</span>
              </div>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className={cn('h-full rounded-full', row.color)} style={{ width: `${row.barWidth}%` }} />
            </div>
            <div className="flex justify-between text-xs text-slate-400 tabular-nums">
              <span>değer: {formatDecisionValue(row.rawValue, row.digits)}</span>
              <span>sinyal: {formatDecisionValue(row.signalValue, 3)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 mt-8">
        <div className="bg-white border border-slate-100 p-3 rounded-xl shadow-sm">
          <div className="text-xs font-bold text-slate-400 mb-1">Yaprak yoğunluğu</div>
          <div className="text-lg font-bold tabular-nums text-slate-900">{currentFrame.metrics.frond_count}</div>
        </div>
        <div className="bg-white border border-slate-100 p-3 rounded-xl shadow-sm">
          <div className="text-xs font-bold text-slate-400 mb-1">Alan kapsaması</div>
          <div className="text-lg font-bold tabular-nums text-slate-900">{currentFrame.metrics.coverage_pct.toFixed(1)}<span className="text-xs text-slate-300">%</span></div>
        </div>
      </div>

      <div className="mt-5 flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl">
        <AlertCircle size={14} className="text-amber-600 mt-0.5 shrink-0" />
        <p className="text-sm leading-relaxed font-semibold text-amber-800">Korelasyon ≠ nedensellik; biyokimyasal validasyon gerekir.</p>
      </div>
    </motion.div>
  );
}

function AnalysisTab({ model }: { model: any }) {
  return (
    <motion.div key="analysis" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col gap-6">
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6 flex-1 min-h-[56vh] xl:min-h-[clamp(620px,72vh,940px)]">
        <div className="flex flex-col gap-4 min-h-0">
          <TopMetricsRow model={model} />
          <div className="min-h-[360px] h-[clamp(360px,58vh,820px)]">
            <ImageViewer model={model} />
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-500">Seçili frame özeti</p>
            <p className="mt-2 text-sm text-slate-700">
              {model.currentFrame?.decision?.rationale ?? 'Karar özeti bulunamadı.'}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <CollapsibleCard title="QC detayları" description="Kalite metrikleri ve doğrulama notları" defaultOpen>
            <QcSummaryPanel model={model} />
          </CollapsibleCard>
          <CollapsibleCard title="Export modülü" description="CSV/rapor çıktı seçenekleri">
            <ExportPanel model={model} />
          </CollapsibleCard>
          <CollapsibleCard title="Hata grupları" description="Severity bazlı hata dağılımı">
            {model.errorSeverityEntries.length === 0 ? (
              <p className="text-sm text-slate-500">Hata kaydı yok.</p>
            ) : (
              <div className="space-y-2">
                {model.errorSeverityEntries.map(([severity, rows]: [string, any[]]) => (
                  <div key={severity} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
                    <span className="font-semibold text-slate-700 uppercase">{severity}</span>
                    <span className="tabular-nums text-slate-500">{rows.length}</span>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleCard>
          <CollapsibleCard title="Teknik pipeline" description="Karar katkıları ve model sinyalleri">
            <DecisionPanel model={model} />
          </CollapsibleCard>
        </div>
      </div>
      <section className="space-y-3">
        <h2 className="text-base font-bold text-slate-800">Karşılaştırma paneli</h2>
        <FrameComparisonPanel model={model} />
      </section>
      <section className="space-y-3">
        <h2 className="text-base font-bold text-slate-800">Fenotipleme</h2>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <p className="text-sm text-slate-600">Özet: kapsama, stres ve biyokütle metrikleri ana panelde özetlenir.</p>
        </div>
        <CollapsibleCard title="Detay" description="Yoğunluk dağılımı ve ikincil grafikler (varsayılan kapalı)">
          <PhenotypingSummary model={model} />
        </CollapsibleCard>
      </section>
    </motion.div>
  );
}

export function AnalysisLayout({ model }: { model: any }) {
  const tabs = [
    { key: 'analysis', label: 'Kare Analizi' },
    { key: 'stats', label: 'Batch İstatistikleri' },
    { key: 'insights', label: 'Bilimsel Yorum' },
  ];

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#f8fafc] scientific-grid">
      <div className="lg:hidden px-4 sm:px-6 lg:px-8 pt-4">
        <nav className="flex items-center gap-2 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => model.setActiveTab(tab.key)}
              className={cn(
                'shrink-0 rounded-xl px-4 py-2 text-xs font-bold transition-colors',
                model.activeTab === tab.key ? 'bg-slate-900 text-white shadow-lg' : 'bg-white text-slate-600 border border-slate-200'
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 h-full">
        <AnalysisSidebar model={model} />
        <main className="col-span-1 lg:col-span-10 px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6 overflow-y-auto">
        <AnimatePresence mode="wait">
          {model.activeTab === 'analysis' ? <AnalysisTab model={model} /> : model.activeTab === 'insights' ? <InsightsView model={model} /> : <BatchStatsView model={model} />}
        </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
