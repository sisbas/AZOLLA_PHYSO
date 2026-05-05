import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { cn } from '../App';
import { 
  Activity, TrendingUp, Droplets, Leaf, Microscope, 
  BarChart3, PieChart, Layers, Download, RefreshCw,
  AlertCircle, CheckCircle2, Info, Sprout, FlaskConical,
  ArrowUpRight, ArrowDownRight, Minimize2, Maximize2
} from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, Cell,
  PieChart as RechartsPie, Pie
} from 'recharts';

interface PhenotypingData {
  segmentasyon: {
    azolla_area_pixels: number;
    azolla_area_m2: number;
    coverage_percent: number;
    water_surface_percent: number;
  };
  renk_indeksleri: {
    agi_index: number;
    saci_index: number;
    chlorophyll_index: number;
  };
  stres_analizi: {
    browning_percent: number;
    yellowing_percent: number;
    stress_score: number;
  };
  yogunluk_dagilimi: {
    low_percent: number;
    medium_percent: number;
    high_percent: number;
  };
  doku_analizi: {
    contrast: number;
    homogeneity: number;
    energy: number;
    correlation: number;
  };
  biyokutle_tahmini: {
    fresh_biomass_g_m2: number;
    dry_biomass_g_m2: number;
    protein_content_percent: number;
  };
  buyume_parametreleri: {
    growth_rate_percent_day: number;
    doubling_time_days: number;
    max_coverage_percent: number;
  };
  errors?: any[];
}

interface MetricCardProps {
  title: string;
  value: string | number;
  unit: string;
  icon: any;
  trend?: 'up' | 'down' | 'neutral';
  description?: string;
  color?: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ 
  title, value, unit, icon: Icon, trend, description, color = 'slate' 
}) => {
  const colorClasses = {
    slate: 'from-slate-500 to-slate-600',
    emerald: 'from-emerald-500 to-emerald-600',
    blue: 'from-blue-500 to-blue-600',
    amber: 'from-amber-500 to-amber-600',
    rose: 'from-rose-500 to-rose-600',
    violet: 'from-violet-500 to-violet-600',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
    >
      <div className={cn("h-1.5 w-full bg-gradient-to-r", colorClasses[color as keyof typeof colorClasses])} />
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center",
              `bg-${color}-50 text-${color}-600`
            )}>
              <Icon size={16} />
            </div>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500">{title}</h3>
          </div>
          {trend && (
            <div className={cn(
              "flex items-center gap-0.5 px-2 py-1 rounded-full text-[9px] font-bold",
              trend === 'up' ? 'bg-emerald-50 text-emerald-600' :
              trend === 'down' ? 'bg-rose-50 text-rose-600' :
              'bg-slate-50 text-slate-500'
            )}>
              {trend === 'up' ? <ArrowUpRight size={10} /> : 
               trend === 'down' ? <ArrowDownRight size={10} /> : 
               <Minimize2 size={10} />}
              {trend === 'up' ? '+' : trend === 'down' ? '-' : ''}
            </div>
          )}
        </div>
        <div className="flex items-baseline gap-1 mb-2">
          <span className="text-2xl font-black text-slate-900 tracking-tight">{value}</span>
          <span className="text-[9px] font-bold text-slate-400 uppercase">{unit}</span>
        </div>
        {description && (
          <p className="text-[9px] text-slate-500 leading-relaxed">{description}</p>
        )}
      </div>
    </motion.div>
  );
};

export default function PhenotypingView() {
  const [data, setData] = useState<PhenotypingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [poolArea, setPoolArea] = useState(16);
  const [segmentationMask, setSegmentationMask] = useState<string | null>(null);
  const [densityMap, setDensityMap] = useState<string | null>(null);

  const handleAnalyze = async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('image', file);
      form.append('pool_area_m2', String(poolArea));
      const res = await fetch('/api/v1/phenotyping/analyze', { method: 'POST', body: form });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `API hatası (${res.status})`);
      }
      const result = await res.json();
      setData(result);
      setSegmentationMask(result.images?.segmentasyon_maskesi ?? null);
      setDensityMap(result.images?.yogunluk_haritasi ?? null);
    } catch (err: any) {
      setError(err.message || 'Analiz sırasında hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8fafc] p-8 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="animate-spin mx-auto mb-4 text-slate-400" size={32} />
          <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Fenotipleme analizi çalışıyor...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#f8fafc] p-8 flex items-center justify-center">
        <div className="text-center max-w-md">
          <AlertCircle className="mx-auto mb-4 text-rose-500" size={48} />
          <h2 className="text-lg font-black text-slate-900 mb-2">Veri Yüklenemedi</h2>
          <p className="text-sm text-slate-500 mb-4">{error || 'Veri bulunamadı'}</p>
          <div className="space-y-3">
            <input
              type="number"
              value={poolArea}
              onChange={(e) => setPoolArea(Number(e.target.value || 16))}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              placeholder="Havuz alanı (m²)"
            />
            <input
              type="file"
              accept="image/png,image/jpeg"
              onChange={(e) => e.target.files?.[0] && handleAnalyze(e.target.files[0])}
              className="w-full text-xs"
            />
          </div>
        </div>
      </div>
    );
  }

  const densityChartData = [
    { name: 'Düşük', value: data.yogunluk_dagilimi.low_percent, color: '#94a3b8' },
    { name: 'Orta', value: data.yogunluk_dagilimi.medium_percent, color: '#3b82f6' },
    { name: 'Yüksek', value: data.yogunluk_dagilimi.high_percent, color: '#10b981' },
  ];

  const textureChartData = [
    { name: 'Contrast', value: data.doku_analizi.contrast },
    { name: 'Homojenlik', value: data.doku_analizi.homogeneity },
    { name: 'Enerji', value: data.doku_analizi.energy },
    { name: 'Korelasyon', value: data.doku_analizi.correlation },
  ];

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <div className="max-w-[1600px] mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
                  <Microscope size={20} />
                </div>
                <div>
                  <h1 className="text-xl font-black text-slate-900 tracking-tight">
                    RGB Fenotipleme & Biyokütle Tahmini
                  </h1>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                    Azolla microphylla Analiz Modülü
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-slate-200 transition-colors">
                <Download size={14} />
                Rapor İndir
              </button>
              <button className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-slate-800 transition-colors">
                <RefreshCw size={14} />
                Yeni Görüntü İçin Sol Paneli Kullan
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1600px] mx-auto p-8">
        {/* Segmentasyon ve Alan Metrikleri */}
        <div className="mb-8">
          {(segmentationMask || densityMap) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
              {segmentationMask && <img src={segmentationMask} alt="Segmentasyon maskesi" className="rounded-2xl border border-slate-200 bg-white" />}
              {densityMap && <img src={densityMap} alt="Yoğunluk haritası" className="rounded-2xl border border-slate-200 bg-white" />}
            </div>
          )}
          <div className="flex items-center gap-2 mb-4">
            <Layers size={16} className="text-slate-400" />
            <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Segmentasyon Sonuçları
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="Azolla Kaplama Alanı"
              value={data.segmentasyon.azolla_area_m2.toFixed(2)}
              unit="m²"
              icon={Maximize2}
              color="emerald"
              description={`${data.segmentazion.coverage_percent}% görüntü kaplaması`}
            />
            <MetricCard
              title="Kaplama Yüzdesi"
              value={data.segmentasyon.coverage_percent.toFixed(1)}
              unit="%"
              icon={PieChart}
              trend="up"
              color="blue"
              description={`${data.segmentasyon.water_surface_percent}% su yüzeyi`}
            />
            <MetricCard
              title="Toplam Piksel"
              value={(data.segmentasyon.azolla_area_pixels / 1000).toFixed(1)}
              unit="K piksel"
              icon={Activity}
              color="violet"
            />
            <MetricCard
              title="Su Yüzeyi"
              value={data.segmentasyon.water_surface_percent.toFixed(1)}
              unit="%"
              icon={Droplets}
              color="blue"
            />
          </div>
        </div>

        {/* Renk İndeksleri */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Sprout size={16} className="text-slate-400" />
            <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Renk Bazlı İndeksler
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricCard
              title="AGI (Yeşillik)"
              value={data.renk_indeksleri.agi_index.toFixed(3)}
              unit="indeks"
              icon={Leaf}
              color="emerald"
              description="Azolla Yeşillik İndeksi: (2G-R-B)/(2G+R+B)"
            />
            <MetricCard
              title="SACI (Kontrast)"
              value={data.renk_indeksleri.saci_index.toFixed(3)}
              unit="indeks"
              icon={FlaskConical}
              color="blue"
              description="Su-Azolla Kontrast İndeksi: (G-B)/(G+B)"
            />
            <MetricCard
              title="Klorofil"
              value={data.renk_indeksleri.chlorophyll_index.toFixed(2)}
              unit="indeks"
              icon={Microscope}
              color="violet"
              description="Klorofil Durum İndeksi: G/(R+0.01)"
            />
          </div>
        </div>

        {/* Stres ve Yoğunluk Analizi */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Stres Analizi */}
          <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <AlertCircle size={16} className="text-rose-500" />
              <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                Stres Belirleme
              </h2>
            </div>
            
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Kahverengileşme</span>
                  <span className="text-sm font-black text-slate-900">{data.stres_analizi.browning_percent.toFixed(1)}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-amber-500 to-rose-500 rounded-full"
                    style={{ width: `${Math.min(data.stres_analizi.browning_percent * 5, 100)}%` }}
                  />
                </div>
              </div>
              
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Sararma</span>
                  <span className="text-sm font-black text-slate-900">{data.stres_analizi.yellowing_percent.toFixed(1)}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-yellow-400 to-amber-500 rounded-full"
                    style={{ width: `${Math.min(data.stres_analizi.yellowing_percent * 5, 100)}%` }}
                  />
                </div>
              </div>
              
              <div className="pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Toplam Stres Skoru</span>
                  <span className={cn(
                    "text-lg font-black",
                    data.stres_analizi.stress_score < 5 ? 'text-emerald-600' :
                    data.stres_analizi.stress_score < 15 ? 'text-amber-600' : 'text-rose-600'
                  )}>
                    {data.stres_analizi.stress_score.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Yoğunluk Dağılımı */}
          <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <BarChart3 size={16} className="text-blue-500" />
              <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                Yoğunluk Haritası
              </h2>
            </div>
            
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPie>
                  <Pie
                    data={densityChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {densityChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      borderRadius: '12px', 
                      border: 'none',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      fontSize: '11px'
                    }}
                  />
                </RechartsPie>
              </ResponsiveContainer>
            </div>
            
            <div className="flex items-center justify-center gap-4 mt-4">
              {densityChartData.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-[9px] font-bold text-slate-500 uppercase">{item.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Biyokütle ve Büyüme */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Biyokütle Tahmini */}
          <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <TrendingUp size={16} className="text-emerald-500" />
              <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                Biyokütle Tahmini
              </h2>
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 bg-emerald-50 rounded-xl">
                <div className="text-2xl font-black text-emerald-600 mb-1">
                  {data.biyokutle_tahmini.fresh_biomass_g_m2.toFixed(0)}
                </div>
                <div className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">
                  Taze Ağırlık (g/m²)
                </div>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-xl">
                <div className="text-2xl font-black text-blue-600 mb-1">
                  {data.biyokutle_tahmini.dry_biomass_g_m2.toFixed(1)}
                </div>
                <div className="text-[9px] font-bold text-blue-600 uppercase tracking-wider">
                  Kuru Madde (g/m²)
                </div>
              </div>
              <div className="text-center p-4 bg-violet-50 rounded-xl">
                <div className="text-2xl font-black text-violet-600 mb-1">
                  {data.biyokutle_tahmini.protein_content_percent.toFixed(1)}
                </div>
                <div className="text-[9px] font-bold text-violet-600 uppercase tracking-wider">
                  Protein (%)
                </div>
              </div>
            </div>
            
            <div className="mt-4 p-3 bg-slate-50 rounded-xl">
              <div className="flex items-start gap-2">
                <Info size={14} className="text-slate-400 mt-0.5" />
                <p className="text-[9px] text-slate-500 leading-relaxed">
                  Kalibrasyon modeli: taze_ağırlık = α × kaplama_% + β (α=5.75, β=10.0). 
                  Kuru madde %8, protein klorofil-korelasyonlu tahmin.
                </p>
              </div>
            </div>
          </div>

          {/* Büyüme Parametreleri */}
          <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <Activity size={16} className="text-amber-500" />
              <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                Büyüme Analizi
              </h2>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-amber-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
                    <TrendingUp size={14} className="text-amber-600" />
                  </div>
                  <div>
                    <div className="text-[9px] font-bold text-amber-600 uppercase">Büyüme Hızı</div>
                    <div className="text-xs font-black text-amber-900">%{data.buyume_parametreleri.growth_rate_percent_day.toFixed(1)} / gün</div>
                  </div>
                </div>
                {data.buyume_parametreleri.growth_rate_percent_day > 10 && (
                  <CheckCircle2 size={18} className="text-emerald-500" />
                )}
              </div>
              
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                    <RefreshCw size={14} className="text-blue-600" />
                  </div>
                  <div>
                    <div className="text-[9px] font-bold text-blue-600 uppercase">Katlanma Süresi</div>
                    <div className="text-xs font-black text-blue-900">{data.buyume_parametreleri.doubling_time_days.toFixed(1)} gün</div>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                    <Maximize2 size={14} className="text-emerald-600" />
                  </div>
                  <div>
                    <div className="text-[9px] font-bold text-emerald-600 uppercase">Maksimum Kaplama</div>
                    <div className="text-xs font-black text-emerald-900">%{data.buyume_parametreleri.max_coverage_percent.toFixed(1)}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Doku Analizi */}
        <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <Layers size={16} className="text-violet-500" />
            <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Doku Analizi (GLCM)
            </h2>
          </div>
          
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={textureChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis 
                  dataKey="name" 
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  axisLine={{ stroke: '#cbd5e1' }}
                />
                <YAxis 
                  domain={[0, 1]}
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  axisLine={{ stroke: '#cbd5e1' }}
                />
                <Tooltip
                  contentStyle={{ 
                    borderRadius: '12px', 
                    border: 'none',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    fontSize: '11px'
                  }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {textureChartData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={['#f59e0b', '#10b981', '#8b5cf6', '#3b82f6'][index]} 
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          
          <div className="grid grid-cols-4 gap-4 mt-4">
            {textureChartData.map((item, idx) => (
              <div key={idx} className="text-center p-3 bg-slate-50 rounded-xl">
                <div className="text-[9px] font-bold text-slate-500 uppercase mb-1">{item.name}</div>
                <div className="text-lg font-black text-slate-900">{item.value.toFixed(2)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
