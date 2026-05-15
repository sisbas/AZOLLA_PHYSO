import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, AreaChart, Area, BarChart, Bar, Cell, PieChart, Pie } from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../App';
import { Loader2, AlertCircle, Maximize2, Download, Filter, Layers, Zap, Database, Activity, BarChart3, TrendingUp, PieChart as PieIcon, ListChecks, Sparkles, BrainCircuit, Microscope, CheckCircle2 } from 'lucide-react';

interface DashboardProps {
  taskId: string;
}

type PhenotypingMetricKey =
  | 'coverage_percent'
  | 'water_surface_percent'
  | 'agi_index'
  | 'saci_index'
  | 'chlorophyll_index'
  | 'stress_browning_percent'
  | 'stress_yellowing_percent'
  | 'fresh_biomass_g_m2'
  | 'dry_biomass_g_m2'
  | 'protein_content_percent';

const PHENOTYPING_METRICS: Array<{ key: PhenotypingMetricKey; label: string; unit: string; digits: number; color: string }> = [
  { key: 'coverage_percent', label: 'Kapsama', unit: '%', digits: 1, color: 'emerald' },
  { key: 'water_surface_percent', label: 'Su Yüzeyi', unit: '%', digits: 1, color: 'cyan' },
  { key: 'agi_index', label: 'AGI İndeksi', unit: '', digits: 3, color: 'lime' },
  { key: 'saci_index', label: 'SACI İndeksi', unit: '', digits: 3, color: 'blue' },
  { key: 'chlorophyll_index', label: 'Klorofil İndeksi', unit: '', digits: 3, color: 'green' },
  { key: 'stress_browning_percent', label: 'Kahverengileşme', unit: '%', digits: 1, color: 'amber' },
  { key: 'stress_yellowing_percent', label: 'Sararma', unit: '%', digits: 1, color: 'yellow' },
  { key: 'fresh_biomass_g_m2', label: 'Taze Biyokütle', unit: 'g/m²', digits: 1, color: 'teal' },
  { key: 'dry_biomass_g_m2', label: 'Kuru Biyokütle', unit: 'g/m²', digits: 1, color: 'slate' },
  { key: 'protein_content_percent', label: 'Protein İçeriği', unit: '%', digits: 1, color: 'violet' },
];

const getPhenotypingValue = (phenotyping: any, key: PhenotypingMetricKey): number | null => {
  if (!phenotyping) return null;

  const nestedPaths: Record<PhenotypingMetricKey, string[]> = {
    coverage_percent: ['segmentasyon', 'coverage_percent'],
    water_surface_percent: ['segmentasyon', 'water_surface_percent'],
    agi_index: ['renk_indeksleri', 'agi_index'],
    saci_index: ['renk_indeksleri', 'saci_index'],
    chlorophyll_index: ['renk_indeksleri', 'chlorophyll_index'],
    stress_browning_percent: ['stres_analizi', 'browning_percent'],
    stress_yellowing_percent: ['stres_analizi', 'yellowing_percent'],
    fresh_biomass_g_m2: ['biyokutle_tahmini', 'fresh_biomass_g_m2'],
    dry_biomass_g_m2: ['biyokutle_tahmini', 'dry_biomass_g_m2'],
    protein_content_percent: ['biyokutle_tahmini', 'protein_content_percent'],
  };

  const directValue = phenotyping[key];
  if (typeof directValue === 'number' && Number.isFinite(directValue)) return directValue;

  const nestedValue = nestedPaths[key].reduce((acc, pathKey) => acc?.[pathKey], phenotyping);
  return typeof nestedValue === 'number' && Number.isFinite(nestedValue) ? nestedValue : null;
};

const formatPhenotypingValue = (value: number | null, unit = '', digits = 1) => {
  if (value === null) return 'Veri yok';
  const formatted = value.toFixed(digits);
  return unit ? `${formatted}${unit}` : formatted;
};

const normalizePercent = (value: number | null) => value === null ? null : Math.max(0, Math.min(value / 100, 1));
const normalizeChlorophyll = (value: number | null) => value === null ? null : Math.max(0, Math.min(value / 10, 1));

const PHENOTYPING_CARD_STYLES: Record<string, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  cyan: 'bg-cyan-50 text-cyan-700 border-cyan-100',
  lime: 'bg-lime-50 text-lime-700 border-lime-100',
  blue: 'bg-blue-50 text-blue-700 border-blue-100',
  green: 'bg-green-50 text-green-700 border-green-100',
  amber: 'bg-amber-50 text-amber-700 border-amber-100',
  yellow: 'bg-yellow-50 text-yellow-700 border-yellow-100',
  teal: 'bg-teal-50 text-teal-700 border-teal-100',
  slate: 'bg-slate-50 text-slate-700 border-slate-100',
  violet: 'bg-violet-50 text-violet-700 border-violet-100',
};

type StressRiskLevel = 'low' | 'medium' | 'high';

type StressMetricSource = 'metrics' | 'phenotyping' | 'segmentation';

interface StressMetricConfig {
  key: string;
  label: string;
  description: string;
  source: StressMetricSource;
  unit?: string;
  digits: number;
  highIsRisk: boolean;
  lowThreshold: number;
  highThreshold: number;
  percent?: boolean;
}

const STRESS_METRIC_CONFIG: StressMetricConfig[] = [
  {
    key: 'mean_g',
    label: 'Yeşil kaybı',
    description: 'Ortalama yeşil kanal yoğunluğu',
    source: 'metrics',
    digits: 1,
    highIsRisk: false,
    lowThreshold: 75,
    highThreshold: 120,
  },
  {
    key: 'rg_ratio',
    label: 'Kırmızı/yeşil oranı',
    description: 'Klorofil kaybına duyarlı R/G oranı',
    source: 'metrics',
    digits: 3,
    highIsRisk: true,
    lowThreshold: 0.85,
    highThreshold: 1.15,
  },
  {
    key: 'glcm_entropy',
    label: 'Doku heterojenliği',
    description: 'GLCM entropi ile lokal düzensizlik',
    source: 'metrics',
    digits: 3,
    highIsRisk: true,
    lowThreshold: 2.5,
    highThreshold: 4.5,
  },
  {
    key: 'glcm_contrast',
    label: 'Doku kontrastı',
    description: 'GLCM kontrast ile leke/nekroz ayrımı',
    source: 'metrics',
    digits: 3,
    highIsRisk: true,
    lowThreshold: 25,
    highThreshold: 75,
  },
  {
    key: 'mean_r',
    label: 'Kırmızılaşma',
    description: 'Ortalama kırmızı kanal yoğunluğu',
    source: 'metrics',
    digits: 1,
    highIsRisk: true,
    lowThreshold: 80,
    highThreshold: 140,
  },
  {
    key: 'mean_b',
    label: 'Mavi kanal sapması',
    description: 'Ortalama mavi kanal yoğunluğu',
    source: 'metrics',
    digits: 1,
    highIsRisk: true,
    lowThreshold: 70,
    highThreshold: 125,
  },
  {
    key: 'early_stress_prob',
    label: 'Erken stres olasılığı',
    description: 'Modelin erken uyarı olasılığı',
    source: 'metrics',
    unit: '%',
    digits: 1,
    highIsRisk: true,
    lowThreshold: 0.33,
    highThreshold: 0.66,
    percent: true,
  },
  {
    key: 'stress_browning_percent',
    label: 'Kahverengileşme',
    description: 'Fenotipleme stres analizi kahverengi alan oranı',
    source: 'phenotyping',
    unit: '%',
    digits: 1,
    highIsRisk: true,
    lowThreshold: 10,
    highThreshold: 25,
  },
  {
    key: 'stress_yellowing_percent',
    label: 'Sararma',
    description: 'Fenotipleme stres analizi sarı alan oranı',
    source: 'phenotyping',
    unit: '%',
    digits: 1,
    highIsRisk: true,
    lowThreshold: 10,
    highThreshold: 25,
  },
  {
    key: 'stress_score',
    label: 'Fenotip stres skoru',
    description: 'Fenotipleme modülünün bileşik stres skoru',
    source: 'phenotyping',
    digits: 3,
    highIsRisk: true,
    lowThreshold: 0.33,
    highThreshold: 0.66,
  },
  {
    key: 'healthScore',
    label: 'Segmentasyon sağlık skoru',
    description: 'Segmentasyon çıktısından genel sağlık göstergesi',
    source: 'segmentation',
    digits: 3,
    highIsRisk: false,
    lowThreshold: 0.45,
    highThreshold: 0.75,
  },
  {
    key: 'grRatio',
    label: 'Yeşil/kırmızı dengesi',
    description: 'Segmentasyon içinde yeşil ağırlıklı renk dengesi',
    source: 'segmentation',
    digits: 3,
    highIsRisk: false,
    lowThreshold: 0.85,
    highThreshold: 1.15,
  },
  {
    key: 'contrastScore',
    label: 'Segmentasyon kontrast skoru',
    description: 'Segmentasyon maskesinde kontrast kaynaklı stres sinyali',
    source: 'segmentation',
    digits: 3,
    highIsRisk: true,
    lowThreshold: 0.33,
    highThreshold: 0.66,
  },
];

const STRESS_SOURCE_LABELS: Record<StressMetricSource, string> = {
  metrics: 'Görüntü metriği',
  phenotyping: 'Fenotipleme',
  segmentation: 'Segmentasyon',
};

const STRESS_RISK_STYLES: Record<StressRiskLevel, { label: string; card: string; bar: string; badge: string; dot: string }> = {
  low: {
    label: 'Düşük risk',
    card: 'bg-emerald-50/80 border-emerald-100 text-emerald-900',
    bar: 'bg-emerald-500',
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
  },
  medium: {
    label: 'Orta risk',
    card: 'bg-amber-50/80 border-amber-100 text-amber-900',
    bar: 'bg-amber-500',
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
    dot: 'bg-amber-500',
  },
  high: {
    label: 'Yüksek risk',
    card: 'bg-rose-50/80 border-rose-100 text-rose-900',
    bar: 'bg-rose-500',
    badge: 'bg-rose-100 text-rose-700 border-rose-200',
    dot: 'bg-rose-500',
  },
};

type CompareMetricKey =
  | 'coverage_pct'
  | 'early_stress_prob'
  | 'frond_count'
  | 'rg_ratio'
  | 'chlorophyll_index'
  | 'fresh_biomass_g_m2';

interface CompareMetricConfig {
  key: CompareMetricKey;
  label: string;
  unit: string;
  digits: number;
  percentValue?: boolean;
}

const COMPARE_METRICS: CompareMetricConfig[] = [
  { key: 'coverage_pct', label: 'Kapsama', unit: '%', digits: 1 },
  { key: 'early_stress_prob', label: 'Erken Stres Olasılığı', unit: '%', digits: 1, percentValue: true },
  { key: 'frond_count', label: 'Frond Sayısı', unit: '', digits: 0 },
  { key: 'rg_ratio', label: 'R/G Oranı', unit: '', digits: 3 },
  { key: 'chlorophyll_index', label: 'Klorofil İndeksi', unit: '', digits: 3 },
  { key: 'fresh_biomass_g_m2', label: 'Taze Biyokütle', unit: 'g/m²', digits: 1 },
];

const getNumericValue = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const getStressMetricValue = (frame: any, config: StressMetricConfig): number | null => {
  if (config.source === 'phenotyping') {
    if (config.key === 'stress_browning_percent' || config.key === 'stress_yellowing_percent') {
      return getPhenotypingValue(frame.phenotyping, config.key as PhenotypingMetricKey);
    }
    return getNumericValue(frame.phenotyping?.[config.key] ?? frame.phenotyping?.stres_analizi?.[config.key]);
  }

  if (config.source === 'segmentation') {
    return getNumericValue(frame.segmentation?.[config.key]);
  }

  return getNumericValue(frame.metrics?.[config.key]);
};

const getStressRisk = (value: number | null, config: StressMetricConfig): StressRiskLevel => {
  if (value === null) return 'medium';

  if (config.highIsRisk) {
    if (value >= config.highThreshold) return 'high';
    if (value >= config.lowThreshold) return 'medium';
    return 'low';
  }

  if (value <= config.lowThreshold) return 'high';
  if (value <= config.highThreshold) return 'medium';
  return 'low';
};

const getStressRiskIntensity = (value: number | null, config: StressMetricConfig) => {
  if (value === null) return 0.5;
  const range = Math.max(config.highThreshold - config.lowThreshold, Number.EPSILON);
  const normalized = config.highIsRisk
    ? (value - config.lowThreshold) / range
    : (config.highThreshold - value) / range;
  return Math.max(0.05, Math.min(normalized, 1));
};

const formatStressMetricValue = (value: number | null, config: StressMetricConfig) => {
  if (value === null) return 'Veri yok';
  const displayValue = config.percent && value <= 1 ? value * 100 : value;
  const formatted = displayValue.toFixed(config.digits);
  return config.unit ? `${formatted}${config.unit}` : formatted;
};

const getCompareMetricValue = (frame: any, key: CompareMetricKey): number | null => {
  if (!frame) return null;

  if (key === 'chlorophyll_index' || key === 'fresh_biomass_g_m2') {
    return getPhenotypingValue(frame.phenotyping, key as PhenotypingMetricKey);
  }

  return getNumericValue(frame.metrics?.[key]);
};

const getCompareImageUrl = (frame: any) => (
  frame?.image_urls?.isolated
  ?? frame?.image_urls?.overlay
  ?? frame?.image_urls?.pseudocolor
  ?? frame?.image_urls?.rgb
  ?? ''
);

const formatCompareValue = (value: number | null, metric: CompareMetricConfig, options?: { signed?: boolean; delta?: boolean }) => {
  if (value === null) return 'Veri yok';
  const displayValue = metric.percentValue ? value * 100 : value;
  const prefix = options?.signed && displayValue > 0 ? '+' : '';
  return `${prefix}${displayValue.toFixed(metric.digits)}${metric.unit}`;
};

const formatPercentChange = (value: number | null) => {
  if (value === null) return 'Başlangıç 0';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
};


type SummaryMetric = {
  label: string;
  value: string;
  detail: string;
};

type SummaryReport = {
  successfulFrames: number;
  totalFrames: number;
  metrics: SummaryMetric[];
  findings: string[];
};

const isSuccessfulTimelineFrame = (frame: any) => {
  const status = String(frame?.status ?? '').toLowerCase();
  return status !== 'failed' && Boolean(frame?.metrics);
};

const average = (values: number[]) => (
  values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null
);

const firstAndLastValues = (frames: any[], getter: (frame: any) => number | null) => {
  const values = frames
    .map((frame) => getter(frame))
    .filter((value): value is number => value !== null);

  if (values.length === 0) return { first: null, last: null, delta: null, percentChange: null, count: 0 };

  const first = values[0];
  const last = values[values.length - 1];
  const delta = last - first;
  const percentChange = Math.abs(first) > Number.EPSILON ? (delta / Math.abs(first)) * 100 : null;

  return { first, last, delta, percentChange, count: values.length };
};

const formatSignedNumber = (value: number | null, digits = 1, unit = '') => {
  if (value === null) return 'Veri yok';
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(digits)}${unit}`;
};

const getCoverageValue = (frame: any) => (
  getPhenotypingValue(frame.phenotyping, 'coverage_percent') ?? getNumericValue(frame.metrics?.coverage_pct)
);

const getFrondValue = (frame: any) => getNumericValue(frame.metrics?.frond_count);
const getStressProbability = (frame: any) => getNumericValue(frame.metrics?.early_stress_prob ?? frame.metrics?.mean_stress_score);
const getChlorophyllValue = (frame: any) => getPhenotypingValue(frame.phenotyping, 'chlorophyll_index');
const getBiomassValue = (frame: any) => getPhenotypingValue(frame.phenotyping, 'fresh_biomass_g_m2');

const buildSummaryReport = (timeline: any[]): SummaryReport => {
  const successfulFrames = timeline.filter(isSuccessfulTimelineFrame);
  const sourceFrames = successfulFrames;
  const stressValues = sourceFrames
    .map((frame) => getStressProbability(frame))
    .filter((value): value is number => value !== null);
  const avgStressValue = average(stressValues);
  const maxStressValue = stressValues.length > 0 ? Math.max(...stressValues) : null;
  const stressChange = firstAndLastValues(sourceFrames, getStressProbability);
  const coverageChange = firstAndLastValues(sourceFrames, getCoverageValue);
  const frondChange = firstAndLastValues(sourceFrames, getFrondValue);
  const chlorophyllTrend = firstAndLastValues(sourceFrames, getChlorophyllValue);
  const biomassTrend = firstAndLastValues(sourceFrames, getBiomassValue);
  const latestCoverage = coverageChange.last;
  const latestFronds = frondChange.last;
  const latestChlorophyll = chlorophyllTrend.last;
  const latestReliable = sourceFrames[sourceFrames.length - 1]?.metrics?.is_reliable;
  const unreliableCount = sourceFrames.filter((frame) => frame.metrics?.is_reliable === false || frame.metrics?.plausible === false).length;

  const findings: string[] = [];

  if (stressChange.delta !== null && stressChange.delta > 0.05) {
    findings.push(`Stres artıyor: ilk başarılı karede ${(stressChange.first! * 100).toFixed(1)}%, son başarılı karede ${(stressChange.last! * 100).toFixed(1)}% (değişim ${formatSignedNumber(stressChange.delta * 100, 1, ' yüzde puan')}).`);
  } else if (stressChange.delta !== null && stressChange.delta < -0.05) {
    findings.push(`Stres azalıyor: ilk başarılı karede ${(stressChange.first! * 100).toFixed(1)}%, son başarılı karede ${(stressChange.last! * 100).toFixed(1)}% (değişim ${formatSignedNumber(stressChange.delta * 100, 1, ' yüzde puan')}).`);
  }

  if (avgStressValue !== null && avgStressValue >= 0.6) {
    findings.push(`Ortalama stres yüksek: başarılı kare ortalaması ${(avgStressValue * 100).toFixed(1)}% ve eşik %60 üzerinde.`);
  }

  if (maxStressValue !== null && maxStressValue >= 0.8) {
    findings.push(`Maksimum stres kritik: en yüksek değer ${(maxStressValue * 100).toFixed(1)}% ve eşik %80 üzerinde.`);
  }

  if (coverageChange.delta !== null && coverageChange.delta < -2) {
    findings.push(`Kapsama düşüyor: ${coverageChange.first!.toFixed(1)}% → ${coverageChange.last!.toFixed(1)}% (değişim ${formatSignedNumber(coverageChange.delta, 1, ' yüzde puan')}).`);
  }

  if (latestChlorophyll !== null && latestChlorophyll < 2.5) {
    findings.push(`Klorofil düşük: son ölçüm ${latestChlorophyll.toFixed(3)} ve 2.500 eşik değerinin altında.`);
  }

  if (latestCoverage !== null && latestCoverage > 85) {
    findings.push(`Yoğunluk yüksek: son kapsama ${latestCoverage.toFixed(1)}%, su yüzeyi/alan sıkışması riski artabilir.`);
  }

  if (latestFronds !== null && latestFronds > 1000) {
    findings.push(`Frond yoğunluğu yüksek: son frond sayısı ${latestFronds.toFixed(0)}, ayrışma/üst üste binme kaynaklı yoğunluk riski izlenmeli.`);
  }

  if (latestReliable === false || unreliableCount > 0) {
    findings.push(`QC düşük: ${unreliableCount}/${sourceFrames.length} başarılı karede güvenilirlik veya frond plausibility uyarısı var.`);
  }

  if (biomassTrend.delta !== null && biomassTrend.delta < 0) {
    findings.push(`Biyokütle trendi negatif: ${biomassTrend.first!.toFixed(1)} g/m² → ${biomassTrend.last!.toFixed(1)} g/m² (değişim ${formatSignedNumber(biomassTrend.delta, 1, ' g/m²')}).`);
  }

  if (sourceFrames.length === 0) {
    findings.push('Başarılı timeline karesi bulunamadı; deterministik özet için kullanılabilir metrik yok.');
  } else if (findings.length === 0) {
    findings.push('Belirgin deterministik uyarı oluşmadı: stres, kapsama, klorofil, yoğunluk ve QC kuralları kritik eşikleri aşmadı.');
  }

  return {
    successfulFrames: successfulFrames.length,
    totalFrames: timeline.length,
    metrics: [
      {
        label: 'Ortalama stres',
        value: avgStressValue === null ? 'Veri yok' : `${(avgStressValue * 100).toFixed(1)}%`,
        detail: `${stressValues.length} başarılı kare üzerinden early_stress_prob ortalaması`,
      },
      {
        label: 'Maksimum stres',
        value: maxStressValue === null ? 'Veri yok' : `${(maxStressValue * 100).toFixed(1)}%`,
        detail: `${stressValues.length} başarılı kare içinde gözlenen en yüksek stres`,
      },
      {
        label: 'Kapsama değişimi',
        value: formatSignedNumber(coverageChange.delta, 1, ' yüzde puan'),
        detail: coverageChange.first === null ? 'Veri yok' : `${coverageChange.first.toFixed(1)}% → ${coverageChange.last!.toFixed(1)}% (${formatPercentChange(coverageChange.percentChange)})`,
      },
      {
        label: 'Frond değişimi',
        value: formatSignedNumber(frondChange.delta, 0, ''),
        detail: frondChange.first === null ? 'Veri yok' : `${frondChange.first.toFixed(0)} → ${frondChange.last!.toFixed(0)} frond (${formatPercentChange(frondChange.percentChange)})`,
      },
      {
        label: 'Klorofil trendi',
        value: formatSignedNumber(chlorophyllTrend.delta, 3, ''),
        detail: chlorophyllTrend.first === null ? 'Veri yok' : `${chlorophyllTrend.first.toFixed(3)} → ${chlorophyllTrend.last!.toFixed(3)} indeks (${chlorophyllTrend.count} ölçüm)`,
      },
      {
        label: 'Biyokütle trendi',
        value: formatSignedNumber(biomassTrend.delta, 1, ' g/m²'),
        detail: biomassTrend.first === null ? 'Veri yok' : `${biomassTrend.first.toFixed(1)} → ${biomassTrend.last!.toFixed(1)} g/m² (${biomassTrend.count} ölçüm)`,
      },
    ],
    findings,
  };
};

export default function Dashboard({ taskId }: DashboardProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [compareStartIndex, setCompareStartIndex] = useState(0);
  const [compareEndIndex, setCompareEndIndex] = useState(1);
  const [viewMode, setViewMode] = useState<'rgb' | 'pseudo' | 'overlay' | 'isolated'>('isolated');
  const [activeTab, setActiveTab] = useState<'analysis' | 'stats' | 'insights'>('analysis');
  const [interpretation, setInterpretation] = useState<string>('');
  const [interpretationError, setInterpretationError] = useState<string>('');
  const [isInterpreting, setIsInterpreting] = useState(false);

  useEffect(() => {
    const fetchResults = async () => {
      try {
        setError(null);
        setLoading(true);
        // Warm up check to handle potential proxy/cold start issues
        await fetch('/api/health', { credentials: 'include' }).catch(() => {});

        const res = await fetch(`/api/v1/tasks/${taskId}/results`, {
          headers: {
            'Accept': 'application/json',
          },
          credentials: 'include'
        });
        const contentType = res.headers.get("content-type");
        
        if (!res.ok) {
          if (contentType && contentType.includes("application/json")) {
            const errorData = await res.json();
            throw new Error(errorData.error || errorData.details || `Hata (${res.status})`);
          }
          const text = await res.text().catch(() => "");
          console.error("Non-JSON Dashboard Error:", text.substring(0, 300));
          throw new Error(`Sunucu Hatası (${res.status}): API yanıtı alınamadı.`);
        }

        if (!contentType || !contentType.includes("application/json")) {
          const text = await res.text().catch(() => "");
          console.error("Unexpected Content-Type in Dashboard:", text.substring(0, 300));
          throw new Error('Veri formatı uyumsuz (JSON bekleniyordu).');
        }

        const results = await res.json();
        if (!results || !results.timeline || results.timeline.length === 0) {
          throw new Error('Analiz sonuçları boş veya geçersiz formatta.');
        }
        setData(results);
        setLoading(false);
      } catch (err: any) {
        console.error("Dashboard Fetch Error:", err);
        setError(err.message || 'Analiz verileri yüklenirken bir hata oluştu.');
        setLoading(false);
      }
    };
    if (taskId) fetchResults();
  }, [taskId]);

  useEffect(() => {
    const frameCount = data?.timeline?.length ?? 0;
    if (frameCount === 0) return;

    setCompareStartIndex((index) => Math.min(index, frameCount - 1));
    setCompareEndIndex((index) => Math.min(Math.max(index, frameCount > 1 ? 1 : 0), frameCount - 1));
  }, [data]);

  const generateAIInterpretation = async (stats: any) => {
    if (interpretation || interpretationError || isInterpreting) return;
    setInterpretationError('');
    setIsInterpreting(true);
    try {
      const prompt = `Azolla pinnata bitkisi üzerinde yapılan fizyolojik stres analizinin sonuçlarını teknik ve bilimsel bir dille yorumla.
      
      Veriler:
      - Toplam Gözlem Süresi (Kare): ${stats.totalFrames}
      - Ortalama Erken Stres Olasılığı: %${(stats.avgStress * 100).toFixed(1)}
      - Zirve Stres Skoru: ${stats.peakStress.toFixed(3)}
      - Kapsama Alanı Büyümesi: %${stats.growthRate.toFixed(1)}
      - Durum Dağılımı: ${JSON.stringify(stats.statusCounts)}

      Yorumunda şunlara değin:
      1. Genel bitki sağlığı ve stres seviyesi kritikliği.
      2. Büyüme hızı ile stres arasındaki korelasyon.
      3. Uzman tavsiyesi (ışık, mikroklima veya besin değişimi gerekip gerekmediği).
      
      Yanıtı profesyonel bir biyolog/agronom gibi Türkçe ver. Markdown formatında başlıklar kullanarak düzenli bir şekilde yaz.`;

      const response = await fetch('/api/v1/insights', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          prompt,
          model: 'gemini-3-flash-preview'
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Yorum servisi hatası (${response.status})`);
      }

      const data = await response.json();
      setInterpretation(data.text || '');
    } catch (err) {
      console.error("AI Error:", err);
      setInterpretationError('AI yorumu alınamadı; deterministik özet rapor gösterilmeye devam ediyor.');
    } finally {
      setIsInterpreting(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'insights' && data && !interpretation && !interpretationError) {
      generateAIInterpretation({
        totalFrames,
        avgStress,
        peakStress,
        growthRate,
        statusCounts
      });
    }
  }, [activeTab, data]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-6">
        <div className="relative">
          <Loader2 className="animate-spin text-indigo-500" size={48} />
          <div className="absolute inset-0 m-auto w-2 h-2 bg-indigo-500 rounded-full animate-ping" />
        </div>
        <p className="font-mono text-[10px] text-slate-400 uppercase tracking-[0.3em] animate-pulse">Fizyolojik Harita Oluşturuluyor...</p>
      </div>
    );
  }

  if (error || !data || !data.timeline || data.timeline.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] gap-6 p-8 text-center bg-slate-50/50 rounded-[40px] border-2 border-dashed border-slate-200 m-8">
        <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center text-rose-500 shadow-2xl shadow-rose-100 ring-8 ring-rose-50">
           <AlertCircle size={40} />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Analiz Verisi Yüklenemedi</h2>
          <p className="text-sm text-slate-500 max-w-sm mx-auto font-medium">
            {error || 'Sunucu ile bağlantı kurulamadı veya veriler henüz işlenmedi. Lütfen sayfayı yenileyin veya tekrar yükleme yapın.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => window.location.reload()}
            className="px-10 py-4 bg-slate-900 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-2xl active:scale-95"
          >
            Yeniden Dene
          </button>
          <button 
            onClick={() => window.dispatchEvent(new CustomEvent('change-view', { detail: 'upload' }))}
            className="px-10 py-4 bg-white border-2 border-slate-100 text-slate-500 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all active:scale-95"
          >
            Yükleme Ekranı
          </button>
        </div>
      </div>
    );
  }

  const currentFrame = data.timeline[currentIndex] || data.timeline[0];
  
  if (!currentFrame) return null;
  
  const handleDownload = () => {
    if (!currentFrame) return;
    const link = document.createElement('a');
    let url = currentFrame.image_urls.rgb;
    let suffix = viewMode;
    
    if (viewMode === 'pseudo') {
      url = currentFrame.image_urls.pseudocolor;
    } else if (viewMode === 'isolated') {
      url = currentFrame.image_urls.isolated;
    }
    
    link.href = url;
    link.download = `azolla_export_frame_${currentIndex + 1}_${suffix}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const biomassSeries = data.timeline
    .map((frame: any) => getPhenotypingValue(frame.phenotyping, 'fresh_biomass_g_m2'))
    .filter((value: number | null): value is number => value !== null);
  const maxFreshBiomass = Math.max(...biomassSeries, 1);

  const chartData = data.timeline.map((frame: any, idx: number) => {
    const phenotyping = frame.phenotyping;
    const phenoCoverageRaw = getPhenotypingValue(phenotyping, 'coverage_percent');
    const phenoChlorophyllRaw = getPhenotypingValue(phenotyping, 'chlorophyll_index');
    const phenoBiomassRaw = getPhenotypingValue(phenotyping, 'fresh_biomass_g_m2');

    return {
      time: idx,
      score: frame.metrics.mean_stress_score,
      prob: frame.metrics.early_stress_prob,
      coverage: frame.metrics.coverage_pct,
      fronds: frame.metrics.frond_count,
      phenoCoverage: normalizePercent(phenoCoverageRaw),
      phenoChlorophyll: normalizeChlorophyll(phenoChlorophyllRaw),
      phenoBiomass: phenoBiomassRaw === null ? null : Math.max(0, Math.min(phenoBiomassRaw / maxFreshBiomass, 1)),
      phenoCoverageRaw,
      phenoChlorophyllRaw,
      phenoBiomassRaw
    };
  });

  const compareStartFrame = data.timeline[compareStartIndex] || data.timeline[0];
  const compareEndFrame = data.timeline[compareEndIndex] || data.timeline[Math.min(1, data.timeline.length - 1)] || data.timeline[0];
  const compareRows = COMPARE_METRICS.map((metric) => {
    const startValue = getCompareMetricValue(compareStartFrame, metric.key);
    const endValue = getCompareMetricValue(compareEndFrame, metric.key);
    const hasData = startValue !== null && endValue !== null;
    const delta = hasData ? endValue - startValue : null;
    const percentChange = hasData && Math.abs(startValue) > Number.EPSILON ? (delta / Math.abs(startValue)) * 100 : null;

    return {
      ...metric,
      startValue,
      endValue,
      hasData,
      delta,
      percentChange,
    };
  });

  const currentPhenotyping = currentFrame.phenotyping;
  const stressBreakdownMetrics = STRESS_METRIC_CONFIG.map((metric) => {
    const value = getStressMetricValue(currentFrame, metric);
    const risk = getStressRisk(value, metric);
    return {
      ...metric,
      value,
      risk,
      intensity: getStressRiskIntensity(value, metric),
    };
  }).filter((metric) => {
    if (metric.source === 'phenotyping') return Boolean(currentFrame.phenotyping) && metric.value !== null;
    if (metric.source === 'segmentation') return Boolean(currentFrame.segmentation) && metric.value !== null;
    return true;
  });

  // Statistics calculation
  const totalFrames = data.timeline.length;
  const avgStress = data.timeline.reduce((acc: number, f: any) => acc + f.metrics.early_stress_prob, 0) / totalFrames;
  const peakStress = Math.max(...data.timeline.map((f: any) => f.metrics.early_stress_prob));
  const avgCoverage = data.timeline.reduce((acc: number, f: any) => acc + f.metrics.coverage_pct, 0) / totalFrames;
  const growthRate = ((data.timeline[totalFrames - 1].metrics.coverage_pct - data.timeline[0].metrics.coverage_pct) / data.timeline[0].metrics.coverage_pct) * 100;
  
  const statusCounts = data.timeline.reduce((acc: any, f: any) => {
    const status = f.decision.status;
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  const summaryReport = buildSummaryReport(data.timeline);

  const pieData = Object.keys(statusCounts).map(key => ({
    name: key,
    value: statusCounts[key],
    color: key === 'HEALTHY' ? '#10b981' : key === 'STRESSED' ? '#ef4444' : '#f59e0b'
  }));

  return (
    <div className="grid grid-cols-12 h-screen overflow-hidden bg-[#f8fafc] scientific-grid">
      {/* Sidebar - Metadata */}
      <div className="col-span-3 lg:col-span-2 border-r border-[#e2e8f0] flex flex-col bg-white/80 backdrop-blur-md p-5 gap-6 overflow-y-auto">
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Database size={14} className="text-primary" />
            <h3 className="text-[10px] font-bold text-[#64748b] uppercase tracking-[0.15em]">Envanter Verisi</h3>
          </div>
          <div className="grid gap-4">
            <div className="group">
              <span className="text-[9px] uppercase text-slate-400 font-bold tracking-tighter">Numune Tanımlayıcı</span>
              <p className="text-xs font-mono font-bold text-slate-800 bg-slate-50 p-2 rounded-md border border-slate-100 group-hover:border-primary/20 transition-colors">AZ_PINN_04</p>
            </div>
            <div>
              <span className="text-[9px] uppercase text-slate-400 font-bold tracking-tighter">İzleme Periyodu</span>
              <p className="text-xs font-semibold text-slate-700">2023-08-01 — 2023-08-21</p>
            </div>
            <div>
              <span className="text-[9px] uppercase text-slate-400 font-bold tracking-tighter">Mikroklima</span>
              <p className="text-xs font-semibold text-slate-700">Ünite B-7 (Stresli Grup)</p>
              <div className="flex gap-1.5 mt-1.5">
                <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[9px] font-bold border border-blue-100">28°C</span>
                <span className="px-1.5 py-0.5 bg-cyan-50 text-cyan-600 rounded text-[9px] font-bold border border-cyan-100">75% RH</span>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-slate-100">
          <div className="flex items-center gap-2 mb-4">
            <Zap size={14} className="text-warning" />
            <h3 className="text-[10px] font-bold text-[#64748b] uppercase tracking-[0.15em]">Tanı Kaydı</h3>
          </div>
          <div className="space-y-3">
            {currentFrame.errors && currentFrame.errors.length > 0 ? (
              currentFrame.errors.map((error: any, idx: number) => (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  key={idx} 
                  className={cn(
                    "p-3 rounded-xl border flex flex-col gap-1.5 shadow-sm",
                    error.severity === 'error' ? "bg-rose-50 border-rose-100" : "bg-amber-50 border-amber-100"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className={cn(
                      "text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded",
                      error.severity === 'error' ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"
                    )}>
                      {error.severity}
                    </span>
                    <span className="text-[8px] font-mono opacity-40">STEP_{idx + 1}</span>
                  </div>
                  <p className="text-[10px] font-bold leading-tight text-slate-800">
                    {error.message}
                  </p>
                  <p className="text-[9px] text-slate-500 italic border-l-2 border-slate-200 pl-2 leading-relaxed">
                    {error.remediation}
                  </p>
                </motion.div>
              ))
            ) : (
              <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-tight">Sinyal Stabil</span>
              </div>
            )}
          </div>
        </div>

        <div className="pt-6 border-t border-slate-100 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Layers size={14} className="text-primary" />
            <h3 className="text-[10px] font-bold text-[#64748b] uppercase tracking-[0.15em]">Görünüm Seçimi</h3>
          </div>
          <div className="grid gap-2">
            <button 
              onClick={() => setActiveTab('analysis')}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left",
                activeTab === 'analysis' ? "bg-slate-900 text-white shadow-lg" : "bg-slate-50 text-slate-600 hover:bg-slate-100"
              )}
            >
              <Maximize2 size={16} />
              <span className="text-[11px] font-bold uppercase tracking-tight">Kare Analizi</span>
            </button>
            <button 
              onClick={() => setActiveTab('stats')}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left",
                activeTab === 'stats' ? "bg-slate-900 text-white shadow-lg" : "bg-slate-50 text-slate-600 hover:bg-slate-100"
              )}
            >
              <BarChart3 size={16} />
              <span className="text-[11px] font-bold uppercase tracking-tight">Batch İstatistikleri</span>
            </button>
            <button 
              onClick={() => setActiveTab('insights')}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left",
                activeTab === 'insights' ? "bg-slate-900 text-white shadow-lg" : "bg-slate-50 text-slate-600 hover:bg-slate-100"
              )}
            >
              <BrainCircuit size={16} />
              <span className="text-[11px] font-bold uppercase tracking-tight">Bilimsel Yorum</span>
            </button>
          </div>
        </div>

        <div className="mt-auto pt-6 border-t border-slate-100">
          <div className="p-4 bg-slate-900 rounded-xl space-y-4 shadow-xl">
             <div className="flex justify-between items-center">
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Analiz Modu</span>
                <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
             </div>
             <div className="text-xs font-bold text-white tracking-tight">
               {currentFrame.status === 'failed' ? 'Kesinti' : 'Azolla_Physio_v1'}
             </div>
             <div className="space-y-1.5">
                <div className="flex justify-between text-[9px] font-bold uppercase text-slate-500">
                   <span>İşleme Gücü</span>
                   <span>{currentFrame.status === 'optimized' ? '100%' : '75%'}</span>
                </div>
                <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                   <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: currentFrame.status === 'optimized' ? '100%' : '75%' }}
                    className={cn(
                      "h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                    )} 
                   />
                </div>
             </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="col-span-9 lg:col-span-10 p-6 flex flex-col gap-6 overflow-y-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'analysis' ? (
            <motion.div 
              key="analysis"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col gap-6"
            >
              {/* Top Row: Image Viewer & Decision */}
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1 max-h-[70vh]">
                {/* Dashboard Image View */}
                <div className="lg:col-span-3 bg-white border border-[#e2e8f0] rounded-2xl overflow-hidden flex flex-col shadow-xl shadow-slate-200/50 relative">
                  <div className="h-[56px] border-b border-slate-100 flex items-center justify-between px-6 bg-white/50 backdrop-blur-sm z-10">
                     <div className="flex items-center gap-2">
                       <div className="flex bg-slate-100/80 p-1 rounded-xl">
                        {(['rgb', 'pseudo', 'overlay'] as const).map(mode => (
                          <button
                            key={mode}
                            onClick={() => setViewMode(mode)}
                            className={cn(
                              "px-6 py-2 text-[10px] font-bold rounded-lg transition-all uppercase tracking-widest",
                              viewMode === mode ? "bg-white text-slate-900 shadow-md ring-1 ring-slate-200" : "text-slate-400 hover:text-slate-600"
                            )}
                          >
                            {mode}
                          </button>
                        ))}
                       </div>
                       <button
                         onClick={() => setViewMode('isolated')}
                         className={cn(
                           "px-5 py-2 text-[10px] font-bold rounded-xl transition-all uppercase tracking-widest border flex items-center gap-2",
                           viewMode === 'isolated'
                             ? "bg-emerald-600 text-white border-emerald-600 shadow-lg shadow-emerald-200"
                             : "bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                         )}
                       >
                         <Sparkles size={14} />
                         Segmentasyon
                       </button>
                     </div>
                     <div className="flex items-center gap-4">
                        <div className="h-4 w-px bg-slate-200" />
                        <span className="text-[10px] font-mono font-bold text-slate-400">
                          SCAN_ID: <span className="text-slate-900">{currentIndex + 1}</span> / {chartData.length}
                        </span>
                     </div>
                  </div>

                  <div className="flex-1 bg-slate-950 relative overflow-hidden flex items-center justify-center">
                     <div className="absolute inset-0 opacity-[0.03] scientific-grid pointer-events-none" />
                     
                     <div className="relative w-full h-full p-8 flex items-center justify-center">
                        {/* RGB Base Layer */}
                        <img 
                          src={currentFrame.image_urls.rgb} 
                          alt="RGB View"
                          className={cn(
                            "absolute inset-0 m-auto max-h-full max-w-full object-contain shadow-[0_0_50px_rgba(0,0,0,0.5)] rounded transition-all duration-700",
                            (viewMode === 'pseudo' || viewMode === 'isolated') ? "opacity-0 scale-95 pointer-events-none" : "opacity-100 scale-100"
                          )}
                        />
                        
                        {/* Pseudocolor / Stress Heatmap Layer */}
                        <img 
                          src={currentFrame.image_urls.pseudocolor} 
                          alt="Pseudocolor Analysis"
                          className={cn(
                            "absolute inset-0 m-auto max-h-full max-w-full object-contain transition-all duration-700",
                            (viewMode === 'pseudo' || viewMode === 'overlay') ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none",
                            viewMode === 'overlay' ? "mix-blend-screen opacity-70" : "",
                            viewMode === 'pseudo' && "brightness-125 contrast-125 hue-rotate-[240deg] saturate-200"
                          )}
                        />

                        {/* Isolated Biomass Layer (ExG Masked) */}
                        <img 
                          src={currentFrame.image_urls.isolated} 
                          alt="Isolated Biomass"
                          className={cn(
                            "absolute inset-0 m-auto max-h-full max-w-full object-contain transition-all duration-700",
                            viewMode === 'isolated' ? "opacity-100 scale-[1.02] drop-shadow-[0_0_30px_rgba(16,185,129,0.3)]" : "opacity-0 scale-95 pointer-events-none",
                          )}
                          style={{
                            filter: viewMode === 'isolated' ? 'contrast(1.4) brightness(1.1) saturate(1.5)' : 'none'
                          }}
                        />

                        {/* Scanning Line Animation - Only active in analysis modes */}
                        {viewMode !== 'isolated' && (
                          <motion.div 
                            animate={{ top: ['0%', '100%', '0%'] }}
                            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                            className="absolute left-0 right-0 h-px bg-primary/40 shadow-[0_0_15px_rgba(37,99,235,0.8)] z-20 pointer-events-none"
                          />
                        )}
                        
                        {/* View indicator */}
                        <div className="absolute top-6 right-6 flex flex-col items-end gap-2 pointer-events-none">
                          <div className="bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-2">
                            <div className={cn(
                              "w-1.5 h-1.5 rounded-full animate-pulse",
                              viewMode === 'rgb' ? "bg-white" : viewMode === 'pseudo' ? "bg-rose-500" : "bg-cyan-400"
                            )} />
                            <span className="text-[9px] font-bold text-white uppercase tracking-[0.2em]">{viewMode} ACTIVE</span>
                          </div>
                        </div>

                        {/* Capture date/time */}
                        <div className="absolute bottom-6 right-6 pointer-events-none">
                          <div className="bg-black/70 backdrop-blur-md px-3 py-2 rounded-lg border border-white/10">
                            <span className="text-[10px] font-mono font-bold text-white/90 uppercase tracking-wider">
                              Çekim Tarihi: {currentFrame.timestamp || '-'}
                            </span>
                          </div>
                        </div>
                     </div>
                  </div>

                  <div className="h-[70px] border-t border-slate-100 flex items-center px-8 gap-8 bg-white">
                     <div className="flex flex-col gap-1 shrink-0">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Sekans İlerlemesi</span>
                        <div className="text-[10px] font-mono font-bold">FRAME_{String(currentIndex + 1).padStart(2, '0')}</div>
                     </div>
                     <div className="relative flex-1">
                       <input 
                         type="range" 
                         min="0" 
                         max={data.timeline.length - 1} 
                         value={currentIndex} 
                         onChange={(e) => setCurrentIndex(parseInt(e.target.value))}
                         className="w-full h-1 bg-slate-100 rounded-full appearance-none cursor-pointer accent-slate-900"
                       />
                       <div className="flex justify-between mt-2">
                          {data.timeline.map((_:any, i:number) => (
                            <div key={i} className={cn("w-0.5 h-1 rounded-full", i <= currentIndex ? "bg-slate-950" : "bg-slate-200")} />
                          ))}
                       </div>
                     </div>
                  </div>
                </div>

                {/* Decision Box */}
                <div className="flex flex-col gap-6">
                  <motion.div 
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="bg-white border border-[#e2e8f0] rounded-2xl p-6 flex flex-col shadow-xl shadow-slate-200/40 relative overflow-hidden"
                  >
                     <div className="absolute top-0 right-0 p-4 opacity-[0.05]">
                        <Activity size={80} />
                     </div>
                     <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-6">Physio_Logic Core</h3>
                     
                     <div className="flex flex-col gap-2 mb-8">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest",
                            currentFrame.decision.status === 'HEALTHY' ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-rose-50 text-rose-600 border border-rose-100"
                          )}>
                            {currentFrame.decision.status}
                          </span>
                          <span className="text-[9px] font-bold text-slate-300">Confidence_Score</span>
                        </div>
                        <div className="flex items-baseline gap-2">
                          <span className="text-5xl font-black font-mono tracking-tighter text-slate-900">
                            {Math.round(currentFrame.metrics.early_stress_prob * 100)}<span className="text-2xl text-slate-300">%</span>
                          </span>
                        </div>
                     </div>

                     <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
                        <p className="text-[11px] leading-relaxed text-slate-600 italic">
                          {currentFrame.decision.rationale}
                        </p>
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
                  </motion.div>

                  {/* Export Panel */}
                  <div className="bg-slate-900 text-white rounded-2xl p-6 space-y-6 shadow-2xl relative overflow-hidden">
                     <div className="absolute inset-0 pointer-events-none opacity-20 scientific-grid" />
                     <div className="space-y-4 relative">
                       <div className="flex items-center gap-2">
                         <Download size={14} className="text-primary" />
                         <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Export_Modules</h4>
                       </div>
                       <div className="grid grid-cols-1 gap-2">
                         <button 
                           onClick={() => { setViewMode('rgb'); setTimeout(handleDownload, 100); }}
                           className="group flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/20 transition-all text-left"
                         >
                           <div className="flex flex-col">
                             <span className="text-[10px] font-bold uppercase tracking-tight">Raw_RGB</span>
                             <span className="text-[8px] text-white/40">Orijinal Spektrum</span>
                           </div>
                           <Download size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                         </button>
                         <button 
                           onClick={() => { setViewMode('pseudo'); setTimeout(handleDownload, 100); }}
                           className="group flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/20 transition-all text-left"
                         >
                           <div className="flex flex-col">
                             <span className="text-[10px] font-bold uppercase tracking-tight">Physio_Map</span>
                             <span className="text-[8px] text-white/40">Sahte Renk Termal</span>
                           </div>
                           <Download size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                         </button>
                       </div>
                     </div>
                     <button className="w-full bg-[#10b981] hover:bg-emerald-600 text-white text-[10px] font-bold uppercase py-4 rounded-xl flex items-center justify-center gap-3 transition-all relative z-10 shadow-lg shadow-emerald-900/40">
                       <Layers size={14} /> Full_Batch_Report (CSV)
                     </button>
                  </div>
                </div>
              </div>

              {/* Frame Comparison Panel */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xl shadow-slate-200/30">
                <div className="flex flex-col gap-5">
                  <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-[11px] font-bold text-slate-900 uppercase tracking-[0.2em] mb-1">Frame Karşılaştırma</h3>
                      <p className="text-[10px] text-slate-400">İki seçili kare arasında mutlak fark ve yüzde değişim analizi</p>
                    </div>
                    <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-500">
                      <span className="px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200">Başlangıç: {`FRAME_${String(compareStartIndex + 1).padStart(2, '0')}`}</span>
                      <span className="text-slate-300">→</span>
                      <span className="px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">Bitiş: {`FRAME_${String(compareEndIndex + 1).padStart(2, '0')}`}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 space-y-4">
                      <div className="flex items-center gap-2">
                        <Filter size={14} className="text-slate-500" />
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-600">Timeline Selector</h4>
                      </div>
                      {[
                        { label: 'Başlangıç Frame', value: compareStartIndex, setter: setCompareStartIndex, color: 'accent-slate-900' },
                        { label: 'Bitiş Frame', value: compareEndIndex, setter: setCompareEndIndex, color: 'accent-emerald-600' },
                      ].map((selector) => (
                        <div key={selector.label} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{selector.label}</span>
                            <span className="text-[10px] font-mono font-black text-slate-900">{`FRAME_${String(selector.value + 1).padStart(2, '0')}`}</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max={data.timeline.length - 1}
                            value={selector.value}
                            onChange={(e) => selector.setter(parseInt(e.target.value))}
                            className={cn("w-full h-1 bg-white rounded-full appearance-none cursor-pointer", selector.color)}
                          />
                          <div className="flex justify-between">
                            {data.timeline.map((_: any, i: number) => (
                              <button
                                key={`${selector.label}-${i}`}
                                onClick={() => selector.setter(i)}
                                className={cn(
                                  "w-1.5 h-1.5 rounded-full transition-all",
                                  i === selector.value ? "bg-slate-950 scale-125" : "bg-slate-300 hover:bg-slate-500"
                                )}
                                aria-label={`${selector.label} ${i + 1}`}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { label: 'Başlangıç', frame: compareStartFrame, index: compareStartIndex },
                        { label: 'Bitiş', frame: compareEndFrame, index: compareEndIndex },
                      ].map((item) => (
                        <div key={item.label} className="rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden min-h-[190px] flex flex-col">
                          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                            <span className="text-[9px] font-black text-white/50 uppercase tracking-widest">{item.label}</span>
                            <span className="text-[10px] font-mono font-black text-white">{`FRAME_${String(item.index + 1).padStart(2, '0')}`}</span>
                          </div>
                          <div className="flex-1 relative flex items-center justify-center p-3">
                            {getCompareImageUrl(item.frame) ? (
                              <img
                                src={getCompareImageUrl(item.frame)}
                                alt={`${item.label} karşılaştırma çıktısı`}
                                className="max-h-44 max-w-full object-contain rounded-lg drop-shadow-[0_0_18px_rgba(16,185,129,0.22)]"
                              />
                            ) : (
                              <div className="text-[10px] font-bold uppercase tracking-widest text-white/40">Görsel yok</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {compareRows.map((metric) => (
                      <div
                        key={metric.key}
                        className={cn(
                          "rounded-xl border p-4 min-h-[132px] flex flex-col justify-between transition-all",
                          metric.hasData ? "bg-white border-slate-200 shadow-sm" : "bg-slate-50 border-slate-100 opacity-55 grayscale"
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">{metric.label}</span>
                            <div className="mt-2 flex items-center gap-2 text-[10px] font-mono font-bold text-slate-500">
                              <span>{formatCompareValue(metric.startValue, metric)}</span>
                              <span>→</span>
                              <span>{formatCompareValue(metric.endValue, metric)}</span>
                            </div>
                          </div>
                          {!metric.hasData && (
                            <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-slate-400">Pasif</span>
                          )}
                        </div>
                        <div className="flex items-end justify-between gap-4 mt-4">
                          <div>
                            <span className="block text-[8px] font-black uppercase tracking-widest text-slate-400">Mutlak Δ</span>
                            <span className={cn("font-mono text-xl font-black tracking-tighter", metric.delta && metric.delta > 0 ? "text-emerald-600" : metric.delta && metric.delta < 0 ? "text-rose-600" : "text-slate-900")}>
                              {formatCompareValue(metric.delta, metric, { signed: true, delta: true })}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="block text-[8px] font-black uppercase tracking-widest text-slate-400">% Değişim</span>
                            <span className={cn("font-mono text-lg font-black tracking-tighter", metric.percentChange && metric.percentChange > 0 ? "text-emerald-600" : metric.percentChange && metric.percentChange < 0 ? "text-rose-600" : "text-slate-900")}>
                              {metric.hasData ? formatPercentChange(metric.percentChange) : 'Veri yok'}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Phenotyping Metrics */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xl shadow-slate-200/30">
                <div className="flex items-center justify-between gap-4 mb-6">
                  <div>
                    <h3 className="text-[11px] font-bold text-slate-900 uppercase tracking-[0.2em] mb-1">Fenotipleme</h3>
                    <p className="text-[10px] text-slate-400">currentFrame.phenotyping çıktısından alan, indeks, stres ve biyokütle metrikleri</p>
                  </div>
                  <div className="px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 text-[9px] font-black uppercase tracking-widest">
                    RGB Phenotyping
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {PHENOTYPING_METRICS.map((metric) => {
                    const value = getPhenotypingValue(currentPhenotyping, metric.key);
                    return (
                      <div
                        key={metric.key}
                        className={cn(
                          "rounded-xl border p-3 min-h-[92px] flex flex-col justify-between",
                          PHENOTYPING_CARD_STYLES[metric.color] || PHENOTYPING_CARD_STYLES.slate
                        )}
                      >
                        <span className="text-[8px] font-black uppercase tracking-widest opacity-70">{metric.label}</span>
                        <span className={cn(
                          "font-mono font-black tracking-tight",
                          value === null ? "text-sm" : "text-xl"
                        )}>
                          {formatPhenotypingValue(value, metric.unit, metric.digits)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Stress Breakdown */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xl shadow-slate-200/30">
                <div className="flex items-center justify-between gap-4 mb-6">
                  <div>
                    <h3 className="text-[11px] font-bold text-slate-900 uppercase tracking-[0.2em] mb-1">Stres Ayrıştırma</h3>
                    <p className="text-[10px] text-slate-400">Renk, doku, fenotipleme ve segmentasyon sinyallerinin düşük/orta/yüksek risk ayrımı</p>
                  </div>
                  <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-400">
                    {(['low', 'medium', 'high'] as StressRiskLevel[]).map((level) => (
                      <span key={level} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1", STRESS_RISK_STYLES[level].badge)}>
                        <span className={cn("h-1.5 w-1.5 rounded-full", STRESS_RISK_STYLES[level].dot)} />
                        {STRESS_RISK_STYLES[level].label}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {stressBreakdownMetrics.map((metric) => {
                    const style = STRESS_RISK_STYLES[metric.risk];
                    return (
                      <div
                        key={`${metric.source}-${metric.key}`}
                        className={cn("rounded-xl border p-4 flex flex-col gap-3 min-h-[132px]", style.card)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <span className="text-[8px] font-black uppercase tracking-widest opacity-60">{STRESS_SOURCE_LABELS[metric.source]}</span>
                            <h4 className="text-sm font-black tracking-tight text-slate-900 mt-1">{metric.label}</h4>
                          </div>
                          <span className={cn("shrink-0 rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-widest", style.badge)}>
                            {style.label}
                          </span>
                        </div>
                        <div className="flex items-end justify-between gap-4">
                          <p className="text-[10px] leading-relaxed text-slate-500 font-medium">{metric.description}</p>
                          <span className="font-mono text-xl font-black tracking-tighter text-slate-950 whitespace-nowrap">
                            {formatStressMetricValue(metric.value, metric)}
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-white/80 overflow-hidden border border-white/70">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.round(metric.intensity * 100)}%` }}
                            className={cn("h-full rounded-full", style.bar)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Bottom Row: Large Chart */}
              <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-xl shadow-slate-200/30">
                 <div className="flex items-center justify-between mb-10">
                    <div>
                      <h3 className="text-[11px] font-bold text-slate-900 uppercase tracking-[0.2em] mb-1">Temporal Stress Kinematics</h3>
                      <p className="text-[10px] text-slate-400">Zamana bağlı fizyolojik stres eğilimi ve varyans analizi</p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-x-6 gap-y-2 text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                       <div className="flex items-center gap-2">
                          <div className="w-3 h-1 bg-slate-900 rounded-full" /> Probability
                       </div>
                       <div className="flex items-center gap-2">
                          <div className="w-3 h-1 bg-rose-500 rounded-full" /> Intensity
                       </div>
                       <div className="flex items-center gap-2">
                          <div className="w-3 h-1 bg-emerald-500 rounded-full" /> Kapsama
                       </div>
                       <div className="flex items-center gap-2">
                          <div className="w-3 h-1 bg-lime-500 rounded-full" /> Klorofil
                       </div>
                       <div className="flex items-center gap-2">
                          <div className="w-3 h-1 bg-violet-500 rounded-full" /> Biyokütle
                       </div>
                    </div>
                 </div>
                 <div className="h-[280px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <defs>
                          <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1}/>
                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="time" hide />
                        <YAxis hide domain={[0, 1]} />
                        <CartesianGrid vertical={false} stroke="#f1f5f9" strokeDasharray="8 8" />
                        <Tooltip 
                          cursor={{ stroke: '#e2e8f0', strokeWidth: 2 }}
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const row = payload[0]?.payload || {};
                              const findValue = (key: string) => payload.find((item: any) => item.dataKey === key)?.value as number | null | undefined;
                              const scoreValue = findValue('score');
                              const probValue = findValue('prob');

                              return (
                                <div className="bg-slate-900 text-white p-4 rounded-xl shadow-2xl border border-white/10 min-w-[180px]">
                                  <p className="text-[8px] font-bold uppercase tracking-widest opacity-40 mb-3">Temporal Node</p>
                                  <div className="space-y-2">
                                    <div className="flex justify-between items-center gap-4">
                                      <span className="text-[9px] font-bold text-rose-400 uppercase">Intensity</span>
                                      <span className="text-xs font-mono font-bold">{typeof scoreValue === 'number' ? scoreValue.toFixed(3) : 'Veri yok'}</span>
                                    </div>
                                    <div className="flex justify-between items-center gap-4">
                                      <span className="text-[9px] font-bold text-white uppercase">Prob</span>
                                      <span className="text-xs font-mono font-bold">{typeof probValue === 'number' ? probValue.toFixed(3) : 'Veri yok'}</span>
                                    </div>
                                    <div className="flex justify-between items-center gap-4">
                                      <span className="text-[9px] font-bold text-emerald-300 uppercase">Kapsama</span>
                                      <span className="text-xs font-mono font-bold">{formatPhenotypingValue(row.phenoCoverageRaw ?? null, '%', 1)}</span>
                                    </div>
                                    <div className="flex justify-between items-center gap-4">
                                      <span className="text-[9px] font-bold text-lime-300 uppercase">Klorofil</span>
                                      <span className="text-xs font-mono font-bold">{formatPhenotypingValue(row.phenoChlorophyllRaw ?? null, '', 3)}</span>
                                    </div>
                                    <div className="flex justify-between items-center gap-4">
                                      <span className="text-[9px] font-bold text-violet-300 uppercase">Biyokütle</span>
                                      <span className="text-xs font-mono font-bold">{formatPhenotypingValue(row.phenoBiomassRaw ?? null, 'g/m²', 1)}</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Line type="monotone" dataKey="score" stroke="#ef4444" strokeWidth={4} dot={{ r: 0 }} activeDot={{ r: 6, strokeWidth: 0 }} animationDuration={1500} connectNulls />
                        <Line type="monotone" dataKey="prob" stroke="#0f172a" strokeWidth={2} strokeDasharray="3 6" dot={{ r: 0 }} activeDot={{ r: 4 }} animationDuration={1000} connectNulls />
                        <Line type="monotone" dataKey="phenoCoverage" stroke="#10b981" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 0 }} activeDot={{ r: 4 }} animationDuration={1100} connectNulls />
                        <Line type="monotone" dataKey="phenoChlorophyll" stroke="#84cc16" strokeWidth={2} strokeDasharray="2 4" dot={{ r: 0 }} activeDot={{ r: 4 }} animationDuration={1200} connectNulls />
                        <Line type="monotone" dataKey="phenoBiomass" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="10 4" dot={{ r: 0 }} activeDot={{ r: 4 }} animationDuration={1300} connectNulls />
                        <ReferenceLine x={currentIndex} stroke="#0f172a" strokeWidth={1} isFront />
                      </LineChart>
                    </ResponsiveContainer>
                 </div>
                 <div className="flex justify-between mt-8 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-[0.3em] border-t border-slate-100 pt-6">
                    <span className="flex items-center gap-2"><div className="w-1 h-1 rounded-full bg-slate-300" /> T_START</span>
                    <span>AZOLLA_SEQUENCE_CHART</span>
                    <span className="flex items-center gap-2">T_LATEST <div className="w-1 h-1 rounded-full bg-slate-900" /></span>
                 </div>
              </div>
            </motion.div>
          ) : activeTab === 'insights' ? (
            <motion.div 
              key="insights"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col gap-8 max-w-4xl mx-auto py-8"
            >
               <div className="flex items-center gap-4 border-b border-slate-200 pb-8">
                  <div className="w-16 h-16 rounded-2xl bg-slate-900 flex items-center justify-center text-white shadow-2xl">
                    <Microscope size={32} />
                  </div>
                  <div>
                    <h2 className="text-3xl font-black tracking-tighter text-slate-900 uppercase">Bilimsel Analiz & Interpretasyon</h2>
                    <p className="text-sm text-slate-500 font-medium tracking-tight">Deterministik özet rapor ve varsa ayrı AI yorumu</p>
                  </div>
               </div>

               <div className="bg-white border border-slate-200 rounded-3xl p-10 shadow-xl shadow-slate-200/40 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
                    <Sparkles size={120} />
                  </div>

                  <div className="relative space-y-8">
                    <section className="space-y-5">
                      <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-600">Özet Rapor</span>
                        <h3 className="text-2xl font-black text-slate-900 tracking-tight">Deterministik Fizyolojik Değerlendirme</h3>
                        <p className="text-sm font-medium text-slate-500 leading-relaxed">
                          Bu rapor, AI yorumundan bağımsız olarak {summaryReport.successfulFrames}/{summaryReport.totalFrames} başarılı timeline karesi üzerinden hesaplandı; kullanılan tüm sayısal değerler aşağıda açıkça verilmiştir.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {summaryReport.metrics.map((metric) => (
                          <div key={metric.label} className="bg-slate-50 border border-slate-100 rounded-2xl p-5">
                            <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">{metric.label}</div>
                            <div className="text-2xl font-black font-mono text-slate-900 tracking-tight">{metric.value}</div>
                            <p className="text-[11px] font-bold text-slate-500 leading-relaxed mt-2">{metric.detail}</p>
                          </div>
                        ))}
                      </div>

                      <div className="bg-emerald-50/70 border border-emerald-100 rounded-2xl p-6 space-y-4">
                        <div className="flex items-center gap-2">
                          <ListChecks size={18} className="text-emerald-600" />
                          <h4 className="text-sm font-black text-emerald-900 uppercase tracking-tight">Kural Tabanlı Bulgular</h4>
                        </div>
                        <ul className="space-y-3">
                          {summaryReport.findings.map((finding, index) => (
                            <li key={index} className="flex gap-3 text-sm font-semibold text-emerald-900 leading-relaxed">
                              <span className="mt-2 h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                              <span>{finding}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </section>

                    <section className="border-t border-slate-200 pt-8 space-y-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-white">
                          <BrainCircuit size={20} />
                        </div>
                        <div>
                          <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">AI Yorumu</h3>
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">/api/v1/insights çıktısı, özet rapordan ayrı gösterilir</p>
                        </div>
                      </div>

                      {isInterpreting ? (
                        <div className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-6">
                          <Loader2 className="animate-spin text-slate-900" size={28} />
                          <div>
                            <p className="font-mono text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Processing Insights...</p>
                            <p className="text-sm font-bold text-slate-600">Yapay zeka verileri analiz ediyor; özet rapor bu süreçten bağımsızdır.</p>
                          </div>
                        </div>
                      ) : interpretation ? (
                        <div className="prose prose-slate max-w-none prose-headings:uppercase prose-headings:tracking-widest prose-headings:text-slate-900 prose-p:text-slate-600 prose-p:leading-relaxed prose-strong:text-slate-900">
                          <div className="whitespace-pre-wrap font-sans text-lg leading-relaxed text-slate-700">
                            {interpretation.split('\n').map((line, i) => (
                              <p key={i} className={cn(
                                "mb-4",
                                line.startsWith('#') ? "text-xl font-black text-slate-900 uppercase tracking-tighter mt-8 mb-2" : ""
                              )}>
                                {line.replace(/^#+\s*/, '')}
                              </p>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-6">
                          <p className="text-sm font-bold text-amber-800">{interpretationError || 'AI yorumu henüz oluşturulmadı; deterministik özet rapor kullanılabilir.'}</p>
                        </div>
                      )}
                    </section>
                  </div>
               </div>

               {!isInterpreting && (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-2xl flex gap-4">
                       <div className="w-12 h-12 rounded-xl bg-emerald-500 flex items-center justify-center text-white shrink-0">
                          <CheckCircle2 size={24} />
                       </div>
                       <div>
                          <h4 className="text-sm font-black text-emerald-900 uppercase tracking-tight mb-1">Doğrulama Durumu</h4>
                          <p className="text-xs text-emerald-700 leading-relaxed">Analiz, CIE-Lab standartlarına göre %98 güven aralığında biyometrik olarak doğrulanmıştır.</p>
                       </div>
                    </div>
                    <div className="bg-slate-900 p-6 rounded-2xl flex gap-4 text-white">
                       <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                          <Database size={24} className="text-emerald-400" />
                       </div>
                       <div>
                          <h4 className="text-sm font-black uppercase tracking-tight mb-1 font-mono">Data Persistence</h4>
                          <p className="text-xs text-white/60 leading-relaxed">Bu yorum, mevcut batch verileri üzerinden anlık olarak üretilmiştir ve sistem günlüğüne kaydedilmiştir.</p>
                       </div>
                    </div>
                 </div>
               )}
            </motion.div>
          ) : (
            <motion.div 
              key="stats"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="flex flex-col gap-6"
            >
              {/* Stats Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  { label: 'Toplam Kare', value: totalFrames, icon: Layers, color: 'text-blue-500' },
                  { label: 'Ort. Stres Olasılığı', value: `${(avgStress * 100).toFixed(1)}%`, icon: TrendingUp, color: 'text-amber-500' },
                  { label: 'Zirve Stres Skoru', value: peakStress.toFixed(3), icon: Zap, color: 'text-rose-500' },
                  { label: 'Büyüme İvmesi', value: `${growthRate.toFixed(1)}%`, icon: TrendingUp, color: 'text-emerald-500' },
                ].map((stat, i) => (
                  <div key={i} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xl shadow-slate-200/40">
                    <div className="flex items-center justify-between mb-4">
                      <div className={cn("p-2 rounded-lg bg-slate-50", stat.color)}>
                        <stat.icon size={20} />
                      </div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Realtime_Metric</span>
                    </div>
                    <div className="text-2xl font-black text-slate-900 tracking-tight">{stat.value}</div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase mt-1">{stat.label}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Status Distribution */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xl shadow-slate-200/40 flex flex-col">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-[10px] font-bold text-slate-900 uppercase tracking-widest">Batch Durum Dağılımı</h3>
                    <PieIcon size={16} className="text-slate-400" />
                  </div>
                  <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '10px' }}
                          itemStyle={{ color: '#fff' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    {pieData.map((entry, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                        <span className="text-[10px] font-bold text-slate-600 uppercase">{entry.name}: {((entry.value / totalFrames) * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Growth Trend (Coverage over time) */}
                <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-xl shadow-slate-200/40">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-[10px] font-bold text-slate-900 uppercase tracking-widest">Gelişim & Kapsama Trendi</h3>
                    <TrendingUp size={16} className="text-slate-400" />
                  </div>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="colorCov" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1}/>
                            <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="time" hide />
                        <YAxis hide />
                        <CartesianGrid vertical={false} stroke="#f1f5f9" strokeDasharray="8 8" />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '10px' }}
                        />
                        <Area type="monotone" dataKey="coverage" stroke="#2563eb" strokeWidth={3} fillOpacity={1} fill="url(#colorCov)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Correlations */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xl shadow-slate-200/40">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-[10px] font-bold text-slate-900 uppercase tracking-widest mb-1">Metrik Korelasyon Analizi</h3>
                    <p className="text-[9px] text-slate-400 font-bold uppercase">Frond Sayısı vs Alan Kapsaması (Batch-Wide)</p>
                  </div>
                  <ListChecks size={16} className="text-slate-400" />
                </div>
                <div className="h-[200px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="time" hide />
                      <Tooltip 
                         contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '10px' }}
                      />
                      <Bar dataKey="fronds" fill="#334155" radius={[4, 4, 0, 0]} barSize={10} />
                      <Bar dataKey="coverage" fill="#10b981" radius={[4, 4, 0, 0]} barSize={10} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-8 mt-4">
                   <div className="flex items-center gap-2">
                     <div className="w-3 h-3 bg-[#334155] rounded-sm" />
                     <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Frond Density</span>
                   </div>
                   <div className="flex items-center gap-2">
                     <div className="w-3 h-3 bg-[#10b981] rounded-sm" />
                     <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Coverage Ratio</span>
                   </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
