import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Activity, Filter, Microscope } from 'lucide-react';
import { cn } from '../../App';
import { AnalysisCard } from './AnalysisCard';
import { analysisTypography } from './typography';

export function PhenotypingSummary({ model }: { model: any }) {
  const {
    currentPhenotyping,
    currentFrondCount,
    currentMeanFrondSize,
    frondQcNote,
    densityRows,
    stressBreakdownMetrics,
    chartData,
    chartDomain,
    selectedChartMetrics,
    enabledSelectedChartMetricConfigs,
    toggleChartMetric,
    CHART_METRICS,
    PHENOTYPING_METRICS,
    PHENOTYPING_CARD_STYLES,
    getPhenotypingValue,
    formatPhenotypingValue,
    formatStressMetricValue,
    getStressRiskClass,
    normalizeChart,
    setNormalizeChart,
    getReferenceLineValue,
  } = model;

  return (
    <>
      <AnalysisCard>
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h3 className={cn(analysisTypography.cardTitle, 'mb-1')}>Fenotipleme Özeti</h3>
            <p className="text-sm text-slate-500 leading-relaxed">Alan, indeks, stres ve biyokütle metrikleri</p>
          </div>
          <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 text-xs font-black">RGB fenotipleme</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {PHENOTYPING_METRICS.map((metric: any) => {
            const value = getPhenotypingValue(currentPhenotyping, metric.key);
            return (
              <div key={metric.key} className={cn('rounded-2xl border p-4', PHENOTYPING_CARD_STYLES[metric.color])}>
                <div className="text-xs font-black opacity-70 mb-2">{metric.label}</div>
                <div className="text-xl font-black tabular-nums tracking-tight">{formatPhenotypingValue(value, metric.unit, metric.digits)}</div>
              </div>
            );
          })}
        </div>
      </AnalysisCard>

      <AnalysisCard>
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h3 className={cn(analysisTypography.cardTitle, 'mb-1')}>Yaprak ve yoğunluk kalite kontrolü</h3>
            <p className="text-sm text-slate-500 leading-relaxed">Yaprak sayısı ve fenotipleme yoğunluk dağılımı</p>
          </div>
          <span className="px-3 py-1 rounded-full bg-slate-50 text-slate-600 border border-slate-100 text-xs font-black">Sayım ve yoğunluk kontrolü</span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-5">
            <div className="text-xs font-black text-slate-400 mb-2">Yaprak sayısı</div>
            <div className="text-3xl font-black tabular-nums text-slate-900">{currentFrondCount === null ? '—' : currentFrondCount.toFixed(0)}</div>
            <div className="text-sm font-semibold text-slate-500 mt-2">Ortalama boyut: {currentMeanFrondSize === null ? 'Veri yok' : `${currentMeanFrondSize.toFixed(1)} px`}</div>
          </div>
          <div className="lg:col-span-2 rounded-2xl border border-slate-100 bg-white p-5">
            <div className="flex justify-between text-xs font-black text-slate-400 mb-3"><span>Yoğunluk dağılımı</span><span>Fenotipleme</span></div>
            <div className="h-3 rounded-full overflow-hidden bg-slate-100 flex">
              {densityRows.map((row: any) => (
                <div key={row.key} className={cn(row.color)} style={{ width: `${Math.max(row.value ?? 0, 0)}%` }} />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3 mt-4">
              {densityRows.map((row: any) => (
                <div key={row.key} className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                  <div className={cn('text-xs font-black', row.textColor)}>{row.label}</div>
                  <div className="text-lg font-black tabular-nums text-slate-900">{row.value === null ? '—' : `${row.value.toFixed(1)}%`}</div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm leading-relaxed font-semibold text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-3">{frondQcNote}</p>
          </div>
        </div>
      </AnalysisCard>

      <AnalysisCard>
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h3 className={cn(analysisTypography.cardTitle, 'mb-1')}>Stres Bileşenleri</h3>
            <p className="text-sm text-slate-500 leading-relaxed">Karar metrikleri, renk kanalları ve fenotipleme stres sinyalleri</p>
          </div>
          <Microscope size={16} className="text-slate-400" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {stressBreakdownMetrics.map((metric: any) => (
            <div key={metric.key} className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-black text-slate-500">{metric.label}</span>
                <span className={cn('px-2 py-0.5 rounded text-xs font-black', getStressRiskClass(metric.risk))}>{metric.risk === 'high' ? 'Yüksek' : metric.risk === 'medium' ? 'Orta' : 'Düşük'}</span>
              </div>
              <div className="text-2xl font-black tabular-nums text-slate-900">{formatStressMetricValue(metric.value, metric)}</div>
              <p className="text-sm text-slate-500 mt-1 leading-relaxed">{metric.description}</p>
              <div className="h-2 bg-white rounded-full overflow-hidden mt-3 border border-slate-100">
                <div className={cn('h-full rounded-full', metric.risk === 'high' ? 'bg-rose-500' : metric.risk === 'medium' ? 'bg-amber-400' : 'bg-emerald-500')} style={{ width: `${metric.intensity * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </AnalysisCard>

      <AnalysisCard>
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5 mb-8">
          <div>
            <h3 className={cn(analysisTypography.cardTitle, 'mb-1')}>Zaman Serisi Analizi</h3>
            <p className="text-sm text-slate-500 leading-relaxed">Seçili metriklerin zaman çizelgesi boyunca trend görünümü</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setNormalizeChart(!normalizeChart)} className={cn('px-3 py-2 rounded-xl border text-xs font-black', normalizeChart ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200')}><Filter size={12} className="inline mr-1" />Normalize</button>
            {CHART_METRICS.map((metric: any) => (
              <button key={metric.key} onClick={() => toggleChartMetric(metric.key)} className={cn('px-3 py-2 rounded-xl border text-xs font-black transition-all', selectedChartMetrics.includes(metric.key) ? 'bg-white text-slate-900 border-slate-300 shadow-sm' : 'bg-slate-50 text-slate-400 border-slate-100')}>
                <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ backgroundColor: metric.color }} />{metric.label}
              </button>
            ))}
          </div>
        </div>
        <div className="h-[360px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid vertical={false} stroke="#f1f5f9" strokeDasharray="8 8" />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 700 }} />
              <YAxis domain={chartDomain} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 700 }} />
              <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '10px' }} />
              {enabledSelectedChartMetricConfigs.map((metric: any) => (
                <Line key={metric.key} type="monotone" dataKey={`${metric.key}Display`} name={metric.label} stroke={metric.color} strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
              ))}
              {enabledSelectedChartMetricConfigs.map((metric: any) => {
                const value = getReferenceLineValue(metric);
                return value === null ? null : <ReferenceLine key={`${metric.key}-ref`} y={value} stroke={metric.color} strokeDasharray="4 4" />;
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-5 flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-xl">
          <Activity size={14} className="text-blue-600 mt-0.5 shrink-0" />
          <p className="text-sm leading-relaxed font-semibold text-blue-800">Grafik normalize edildiğinde her metrik kendi min/max aralığına göre 0-1 bandına taşınır.</p>
        </div>
      </AnalysisCard>
    </>
  );
}
