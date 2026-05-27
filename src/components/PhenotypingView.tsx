import React, { useState } from 'react';
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
import ManualRoiEditor, { RoiPoint } from './analysis/ManualRoiEditor';

interface PhenotypingData {
  qc?: {
    coverage_pct?: number;
    quality_score?: number;
    warnings?: any[];
    leakage_pct?: number;
    plant_fill_pct?: number;
  };
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
    growth_rate_percent_day: number | null;
    doubling_time_days: number | null;
    max_coverage_percent: number;
  };
  date_comparison?: {
    days_diff: number;
    start_date: string;
    end_date: string;
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

const DEFAULT_POOL_AREA_M2 = 16;

const getQualityWarningText = (warning: any) => {
  if (typeof warning === 'string') return warning;

  const candidates = [
    warning?.message,
    warning?.detail,
    warning?.details,
    warning?.error,
    warning?.code,
    warning?.type,
    warning?.reason,
  ].filter(Boolean);

  return candidates.length > 0 ? candidates.join(' ') : JSON.stringify(warning ?? '');
};

const translateQualityWarning = (warning: any) => {
  const rawText = getQualityWarningText(warning);
  const text = rawText.toLocaleLowerCase('tr-TR');

  if (/(illumination|lighting|light|brightness|exposure|shadow|glare|ışık|isik|aydınlatma|parlama|gölge)/.test(text)) {
    return 'Işık çok değişken: gölge ve parlamayı azaltıp homojen ışıkta tekrar çekin.';
  }

  if (/(azolla.*(area|low|small)|area.*(low|small)|coverage.*(low|small)|too\s*low|azolla alan|kaplama.*düşük|alan.*düşük)/.test(text)) {
    return 'Azolla alanı çok düşük: aynı havuz alanını daha net kadraja alın veya örnek yoğunluğunu kontrol edin.';
  }

  if (/(date|timestamp|time|tarih|zaman)/.test(text) && /(missing|absent|not found|eksik|yok|bulunamadı|algılanmadı)/.test(text)) {
    return 'Tarih bilgisi eksik: dosya adına YYYY-MM-DD biçiminde tarih ekleyin.';
  }

  if (/(blur|blurry|focus|sharp|bulanık|netlik|odak)/.test(text)) {
    return 'Görüntü bulanık: kamerayı sabitleyip net odakla yeniden çekin.';
  }

  if (/(contrast|segmentation|mask|kontrast|segmentasyon)/.test(text)) {
    return 'Kontrast zayıf: su ve Azolla ayrımını artıracak daha dengeli ışıkta çekim yapın.';
  }

  return 'Kalite uyarısı var: çekimi sabit kamera, homojen ışık ve doğru havuz alanı ile tekrar kontrol edin.';
};

const getQualityAdvice = (warnings?: any[]) => (
  Array.from(new Set((warnings ?? []).map(translateQualityWarning))).filter(Boolean)
);


const formatNullableMetric = (
  value: number | null | undefined,
  { prefix = '', suffix = '', digits = 1 }: { prefix?: string; suffix?: string; digits?: number } = {}
) => (
  typeof value === 'number' && Number.isFinite(value) ? `${prefix}${value.toFixed(digits)}${suffix}` : 'Veri yok'
);

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
  const [poolArea, setPoolArea] = useState(String(DEFAULT_POOL_AREA_M2));
  const [preprocessedRgbPng, setPreprocessedRgbPng] = useState<string | null>(null);
  const [binaryMaskPng, setBinaryMaskPng] = useState<string | null>(null);
  const [isolatedRgbPng, setIsolatedRgbPng] = useState<string | null>(null);
  const [overlayPng, setOverlayPng] = useState<string | null>(null);
  const [showPlantOnly, setShowPlantOnly] = useState(true);
  const [showAdvancedViews, setShowAdvancedViews] = useState(false);
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [roiMode, setRoiMode] = useState<'auto' | 'manual' | 'hybrid'>('auto');
  const [manualRoiPoints, setManualRoiPoints] = useState<RoiPoint[]>([]);

  const downloadReport = () => {
    if (!data) return;

    const reportPayload = {
      report_type: 'azolla_phenotyping',
      generated_at: new Date().toISOString(),
      mode,
      pool_area_m2: Number(poolArea),
      metrics: data,
      images: {
        preprocessed_rgb_png: preprocessedRgbPng,
        binary_mask_png: binaryMaskPng,
        isolated_rgb_png: isolatedRgbPng,
        overlay_png: overlayPng,
      },
    };

    const blob = new Blob([JSON.stringify(reportPayload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `azolla_phenotyping_report_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleAnalyze = async (file: File) => {
    const parsedPoolArea = Number(poolArea);
    if (!Number.isFinite(parsedPoolArea) || parsedPoolArea <= 0) {
      setError('Havuz alanı 0’dan büyük geçerli bir sayı olmalıdır.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('image', file);
      form.append('pool_area_m2', String(parsedPoolArea));
      if (roiMode !== 'auto' && manualRoiPoints.length >= 3) {
        form.append('manual_roi', JSON.stringify({
          mode: roiMode,
          coordinate_space: 'pixel',
          polygon: manualRoiPoints,
        }));
      }
      if (startDate && endDate) {
        form.append('start_date', startDate);
        form.append('end_date', endDate);
      }
      const res = await fetch('/api/v1/phenotyping/analyze', { method: 'POST', body: form });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `API hatası (${res.status})`);
      }
      const result = await res.json();
      setData(result);
      setPreprocessedRgbPng(result.images?.preprocessed_rgb_png ?? null);
      setBinaryMaskPng(result.images?.binary_mask_png ?? null);
      setIsolatedRgbPng(result.images?.isolated_rgb_png ?? null);
      setOverlayPng(result.images?.overlay_png ?? null);
    } catch (err: any) {
      setError(err.message || 'Analiz sırasında hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const handleBatchUpload = async (files: FileList) => {
    setError(null);
    setLoading(true);
    try {
      // Batch modu için ilk görüntüyü analiz et (gelecekte genişletilebilir)
      if (files.length > 0) {
        await handleAnalyze(files[0]);
      }
    } catch (err: any) {
      setError(err.message || 'Batch analiz sırasında hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const renderRoiModeDraft = () => (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(['auto', 'manual', 'hybrid'] as const).map((modeKey) => (
          <button
            key={modeKey}
            type="button"
            onClick={() => setRoiMode(modeKey)}
            className={cn(
              'px-3 py-1.5 text-xs rounded-md border',
              roiMode === modeKey ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white border-slate-300 text-slate-600'
            )}
          >
            ROI: {modeKey}
          </button>
        ))}
      </div>
      {roiMode === 'manual' && (
        <ManualRoiEditor
          points={manualRoiPoints}
          onChange={setManualRoiPoints}
          onSave={({ polygon }) => setManualRoiPoints(polygon)}
        />
      )}
    </div>
  );

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

  if (!data) {
    return (
      <div className="min-h-screen bg-[#f8fafc] p-8 flex items-center justify-center">
        <div className="w-full max-w-2xl rounded-3xl bg-white border border-slate-200 p-8 text-center shadow-sm">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            {error ? <AlertCircle size={30} className="text-rose-500" /> : <Microscope size={30} />}
          </div>
          <h2 className="text-lg font-black text-slate-900 mb-2">Fenotipleme Analizi Başlat</h2>
          <p className="text-sm text-slate-500 mb-5">
            Havuz alanını girip bir RGB görüntü yükleyerek Azolla kaplama ve biyokütle analizini çalıştırın.
          </p>
          {error && (
            <div className="mb-4 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">
              {error}
            </div>
          )}
          
          {/* Mode Toggle */}
          <div className="flex items-center justify-center gap-2 mb-6">
            <button
              onClick={() => setMode('single')}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest ${mode === 'single' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}
            >
              Tek Görüntü
            </button>
            <button
              onClick={() => setMode('batch')}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest ${mode === 'batch' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}
            >
              Batch Karşılaştırma
            </button>
          </div>
          
          <div className="space-y-3 text-left">
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">
              Havuz alanı (m²)
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={poolArea}
                onChange={(e) => setPoolArea(e.target.value)}
                className="mt-2 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                placeholder="16"
              />
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">
                Başlangıç Tarihi (opsiyonel)
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="mt-2 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </label>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">
                Bitiş Tarihi (opsiyonel)
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="mt-2 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </label>
            </div>
            <div className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold leading-relaxed text-blue-800">
              <Info size={14} className="mt-0.5 shrink-0" />
              <span>Ölçüm doğruluğu alan kalibrasyonuna bağlıdır; havuz alanını gerçek ölçüye göre girin.</span>
            </div>
            {renderRoiModeDraft()}
            
            {mode === 'single' ? (
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">
                Görüntü dosyası
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={(e) => e.target.files?.[0] && handleAnalyze(e.target.files[0])}
                  className="mt-2 w-full rounded-lg border border-dashed border-slate-300 px-3 py-3 text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:py-2 file:text-xs file:font-bold file:text-emerald-700"
                />
              </label>
            ) : (
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">
                Birden fazla görüntü seçin (tarihsel sıralama için dosya adlarında tarih bulunsun: YYYY-MM-DD)
                <input
                  type="file"
                  multiple
                  accept="image/png,image/jpeg"
                  onChange={(e) => e.target.files && handleBatchUpload(e.target.files)}
                  className="mt-2 w-full rounded-lg border border-dashed border-slate-300 px-3 py-3 text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:py-2 file:text-xs file:font-bold file:text-emerald-700"
                />
              </label>
            )}
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

  const qualityWarnings = [...(data.errors ?? []), ...(data.qc?.warnings ?? [])];
  const qualityAdvice = getQualityAdvice(qualityWarnings);
  const roiPrimaryImage = isolatedRgbPng ?? binaryMaskPng ?? overlayPng ?? preprocessedRgbPng;
  const roiPrimaryLabel = isolatedRgbPng
    ? 'ROI görünümü: Yalnızca bitki'
    : binaryMaskPng
      ? 'ROI görünümü: Maske fallback'
      : 'ROI görünümü: Standart fallback';

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
              <button
                onClick={downloadReport}
                disabled={!data}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-xl transition-colors',
                  data
                    ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                )}
              >
                <Download size={14} />
                Rapor İndir
              </button>
              <button 
                onClick={() => window.dispatchEvent(new CustomEvent('change-view', { detail: 'upload' }))}
                className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-slate-800 transition-colors"
              >
                <RefreshCw size={14} />
                Yeni Görüntü İçin Sol Paneli Kullan
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1600px] mx-auto p-8">
        {qualityAdvice.length > 0 && (
          <div className="mb-6 rounded-2xl border border-amber-100 bg-amber-50 p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-white p-2 text-amber-600 shadow-sm">
                <AlertCircle size={18} />
              </div>
              <div>
                <h2 className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">Kalite önerileri</h2>
                <ul className="mt-2 space-y-1 text-xs font-semibold leading-relaxed text-amber-900">
                  {qualityAdvice.map((advice) => (
                    <li key={advice}>• {advice}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Segmentasyon ve Alan Metrikleri */}
        <div className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <button
              onClick={() => setShowPlantOnly((prev) => !prev)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors',
                showPlantOnly ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
              )}
            >
              {showPlantOnly ? 'ROI görünümü: Yalnızca bitki' : 'ROI görünümü: Genişletilmiş'}
            </button>
            {!showPlantOnly && (
              <button
                onClick={() => setShowAdvancedViews((prev) => !prev)}
                className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
              >
                {showAdvancedViews ? 'Gelişmiş Görünümleri Gizle' : 'Gelişmiş Görünümleri Göster'}
              </button>
            )}
          </div>

          {showPlantOnly && roiPrimaryImage && (
            <div className="mb-6">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-600 mb-2">{roiPrimaryLabel}</h3>
              <img src={roiPrimaryImage} alt="ROI görünümü" className="rounded-2xl border border-slate-200 bg-white" />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <div>
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-600 mb-2">İşlenmiş Görsel</h3>
              {preprocessedRgbPng ? (
                <img src={preprocessedRgbPng} alt="İşlenmiş görsel (preprocessed RGB)" className="rounded-2xl border border-slate-200 bg-white" />
              ) : (
                <p className="text-xs text-slate-500">İşlenmiş görsel henüz üretilmedi</p>
              )}
            </div>
            <div>
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-600 mb-2">Segmentasyon</h3>
              {binaryMaskPng ? (
                <>
                  <img src={binaryMaskPng} alt="Segmentasyon maskesi (binary)" className="rounded-2xl border border-slate-200 bg-white" />
                  <p className="mt-2 text-xs text-slate-500">Mask = binary; Isolated = masked RGB</p>
                </>
              ) : (
                <p className="text-xs text-slate-500">Segmentasyon görseli henüz üretilmedi</p>
              )}
            </div>
          </div>

          {!showPlantOnly && showAdvancedViews && (
            <>
              {(isolatedRgbPng || overlayPng) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                  {isolatedRgbPng && (
                    <div>
                      <h3 className="text-xs font-black uppercase tracking-widest text-slate-600 mb-2">İzole RGB (Masked RGB)</h3>
                      <img src={isolatedRgbPng} alt="İzole RGB (mask uygulanmış)" className="rounded-2xl border border-slate-200 bg-white" />
                    </div>
                  )}
                  {overlayPng && (
                    <div>
                      <h3 className="text-xs font-black uppercase tracking-widest text-slate-600 mb-2">Overlay (Yarı saydam maske)</h3>
                      <img src={overlayPng} alt="Overlay (orijinal + yarı saydam maske)" className="rounded-2xl border border-slate-200 bg-white" />
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          <div className="flex items-center gap-2 mb-4">
            <Layers size={16} className="text-slate-400" />
            <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Segmentasyon Sonuçları
            </h2>
          </div>
          {(typeof data.qc?.leakage_pct === 'number' || typeof data.qc?.plant_fill_pct === 'number') && (
            <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-600">
              {typeof data.qc?.leakage_pct === 'number' && (
                <span className="mr-3">ROI leakage: %{data.qc.leakage_pct.toFixed(1)}</span>
              )}
              {typeof data.qc?.plant_fill_pct === 'number' && (
                <span>Plant fill: %{data.qc.plant_fill_pct.toFixed(1)}</span>
              )}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="Azolla Kaplama Alanı"
              value={data.segmentasyon.azolla_area_m2.toFixed(2)}
              unit="m²"
              icon={Maximize2}
              color="emerald"
              description={`${data.segmentasyon.coverage_percent}% görüntü kaplaması`}
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
                    <div className="text-xs font-black text-amber-900">{formatNullableMetric(data.buyume_parametreleri.growth_rate_percent_day, { prefix: '%', suffix: ' / gün' })}</div>
                  </div>
                </div>
                {(data.buyume_parametreleri.growth_rate_percent_day ?? 0) > 10 && (
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
                    <div className="text-xs font-black text-blue-900">{formatNullableMetric(data.buyume_parametreleri.doubling_time_days, { suffix: ' gün' })}</div>
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
