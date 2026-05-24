import { motion } from 'motion/react';
import { AreaChart, Area, BarChart, Bar, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, BarChart3, Layers, ListChecks, PieChart as PieIcon, TrendingUp } from 'lucide-react';
import { cn } from '../../App';
import { AnalysisCard } from './AnalysisCard';
import { analysisTypography } from './typography';

export function BatchStatsView({ model }: { model: any }) {
  const { totalFrames, avgStress, peakStress, avgCoverage, growthRate, pieData, chartData, groupComparisons } = model;
  const pairGroups = groupComparisons.slice(0, 2);
  const pairMetricKeys = Array.from(new Set(pairGroups.flatMap((group: any) => group.metrics.map((metric: any) => metric.key))));
  const getChangeTone = (value: number | null) => (
    value === null
      ? 'bg-slate-100 text-slate-500 border-slate-200'
      : value > 0
        ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
        : value < 0
          ? 'bg-rose-50 text-rose-700 border-rose-100'
          : 'bg-slate-100 text-slate-600 border-slate-200'
  );

  return (
    <motion.div key="stats" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col gap-6">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Toplam Kare', value: totalFrames, icon: Layers, color: 'text-blue-500' },
          { label: 'Ort. Stres', value: `${(avgStress * 100).toFixed(1)}%`, icon: Activity, color: 'text-rose-500' },
          { label: 'Pik Stres', value: peakStress.toFixed(3), icon: BarChart3, color: 'text-amber-500' },
          { label: 'Ort. Kapsama', value: `${avgCoverage.toFixed(1)}%`, icon: PieIcon, color: 'text-emerald-500' },
          { label: 'Büyüme', value: `${growthRate.toFixed(1)}%`, icon: TrendingUp, color: 'text-indigo-500' },
        ].map((item) => (
          <AnalysisCard key={item.label} className="p-5">
            <div className="flex items-center justify-between mb-4"><span className="text-xs font-black text-slate-400">{item.label}</span><item.icon size={16} className={item.color} /></div>
            <div className="text-2xl font-black tabular-nums text-slate-900">{item.value}</div>
          </AnalysisCard>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <AnalysisCard className="flex flex-col">
          <div className="flex items-center justify-between mb-6"><h3 className={analysisTypography.cardTitle}>Batch Durum Dağılımı</h3><PieIcon size={16} className="text-slate-400" /></div>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                  {pieData.map((entry: any, index: number) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '10px' }} itemStyle={{ color: '#fff' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4">
            {pieData.map((entry: any, i: number) => (
              <div key={i} className="flex items-center gap-2"><div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} /><span className="text-xs font-bold text-slate-600">{entry.name}: {((entry.value / totalFrames) * 100).toFixed(0)}%</span></div>
            ))}
          </div>
        </AnalysisCard>

        <AnalysisCard className="lg:col-span-2">
          <div className="flex items-center justify-between mb-6"><h3 className={analysisTypography.cardTitle}>Gelişim & Kapsama Trendi</h3><TrendingUp size={16} className="text-slate-400" /></div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs><linearGradient id="colorCov" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2563eb" stopOpacity={0.1}/><stop offset="95%" stopColor="#2563eb" stopOpacity={0}/></linearGradient></defs>
                <XAxis dataKey="time" hide /><YAxis hide /><CartesianGrid vertical={false} stroke="#f1f5f9" strokeDasharray="8 8" />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '10px' }} />
                <Area type="monotone" dataKey="coverage" stroke="#2563eb" strokeWidth={3} fillOpacity={1} fill="url(#colorCov)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </AnalysisCard>
      </div>

      <AnalysisCard>
        <div className="flex items-center justify-between mb-8"><div><h3 className={cn(analysisTypography.cardTitle, 'mb-1')}>Metrik Korelasyon Analizi</h3><p className="text-sm text-slate-500 font-semibold">Yaprak sayısı ve alan kapsaması (batch geneli)</p></div><ListChecks size={16} className="text-slate-400" /></div>
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" /><XAxis dataKey="time" hide />
              <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '10px' }} />
              <Bar dataKey="fronds" fill="#334155" radius={[4, 4, 0, 0]} barSize={10} />
              <Bar dataKey="coverage" fill="#10b981" radius={[4, 4, 0, 0]} barSize={10} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex justify-center gap-8 mt-4">
          <div className="flex items-center gap-2"><div className="w-3 h-3 bg-[#334155] rounded-sm" /><span className="text-xs font-bold text-slate-400">Yaprak yoğunluğu</span></div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 bg-[#10b981] rounded-sm" /><span className="text-xs font-bold text-slate-400">Kapsama oranı</span></div>
        </div>
      </AnalysisCard>

      <AnalysisCard>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className={cn(analysisTypography.cardTitle, 'mb-1')}>Grup Karşılaştırması</h3>
            <p className="text-sm text-slate-500 font-semibold">Önce/Sonra ortalamaları ve değişim analizi</p>
          </div>
          <Layers size={16} className="text-slate-400" />
        </div>

        {groupComparisons.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
            group_comparisons alanında veri bulunamadı.
          </div>
        ) : (
          <div className="space-y-4">
            {groupComparisons.map((group: any) => (
              <div key={group.group} className="rounded-2xl border border-slate-200 bg-white p-4">
                <h4 className="text-sm font-black text-slate-800 mb-3">{group.group}</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                  {group.metrics.map((metric: any) => (
                    <div key={`${group.group}-${metric.key}`} className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 space-y-1.5">
                      <p className="text-xs font-bold text-slate-500">{metric.label}</p>
                      <p className="text-xs text-slate-600">Önce: {metric.before === null ? 'Veri yok' : `${metric.before.toFixed(2)}${metric.unit}`}</p>
                      <p className="text-xs text-slate-600">Sonra: {metric.after === null ? 'Veri yok' : `${metric.after.toFixed(2)}${metric.unit}`}</p>
                      <div className={cn('rounded-lg border px-2 py-1 text-xs font-bold', getChangeTone(metric.absoluteChange))}>
                        Δ {metric.absoluteChange === null ? 'Veri yok' : `${metric.absoluteChange > 0 ? '+' : ''}${metric.absoluteChange.toFixed(2)}${metric.unit}`}
                      </div>
                      <div className={cn('rounded-lg border px-2 py-1 text-xs font-bold', getChangeTone(metric.percentChange))}>
                        % {metric.percentChange === null ? 'Veri yok' : `${metric.percentChange > 0 ? '+' : ''}${metric.percentChange.toFixed(1)}%`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </AnalysisCard>

      {pairGroups.length >= 2 && (
        <AnalysisCard>
          <div className="flex items-center justify-between mb-6">
            <h3 className={analysisTypography.cardTitle}>{pairGroups[0].group} vs {pairGroups[1].group}</h3>
            <span className="text-xs font-bold text-slate-400">Yan yana kıyas</span>
          </div>
          <div className="space-y-3">
            {pairMetricKeys.map((metricKey: string) => {
              const leftMetric = pairGroups[0].metrics.find((metric: any) => metric.key === metricKey);
              const rightMetric = pairGroups[1].metrics.find((metric: any) => metric.key === metricKey);
              const label = leftMetric?.label ?? rightMetric?.label ?? metricKey;

              return (
                <div key={metricKey} className="rounded-xl border border-slate-100 p-3 bg-slate-50/40">
                  <p className="text-xs font-bold text-slate-500 mb-2">{label}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[{ group: pairGroups[0], metric: leftMetric }, { group: pairGroups[1], metric: rightMetric }].map((item: any) => (
                      <div key={`${item.group.group}-${metricKey}`} className="rounded-lg border border-slate-200 bg-white p-3">
                        <p className="text-xs font-bold text-slate-600 mb-1">{item.group.group}</p>
                        <p className="text-xs text-slate-500">Önce/Sonra: {item.metric?.before === null || item.metric?.before === undefined ? '—' : item.metric.before.toFixed(2)} / {item.metric?.after === null || item.metric?.after === undefined ? '—' : item.metric.after.toFixed(2)}</p>
                        <p className={cn('mt-2 inline-flex rounded-md border px-2 py-1 text-xs font-bold', getChangeTone(item.metric?.absoluteChange ?? null))}>
                          Δ {item.metric?.absoluteChange === null || item.metric?.absoluteChange === undefined ? 'Veri yok' : `${item.metric.absoluteChange > 0 ? '+' : ''}${item.metric.absoluteChange.toFixed(2)}`}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </AnalysisCard>
      )}
    </motion.div>
  );
}
