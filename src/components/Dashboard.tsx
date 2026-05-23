import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, AreaChart, Area, BarChart, Bar, Cell, PieChart, Pie } from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../App';
import { Loader2, AlertCircle, Maximize2, Download, Filter, Layers, Zap, Database, Activity, BarChart3, TrendingUp, PieChart as PieIcon, ListChecks, Sparkles, BrainCircuit, Microscope, CheckCircle2 } from 'lucide-react';
import { AnalysisLayout } from './analysis/AnalysisLayout';

interface DashboardProps {
  taskId: string;
}

type CompareViewMode = 'rgb' | 'pseudo' | 'overlay' | 'isolated';

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

const FROND_COUNT_QC_LOW = 10;
const FROND_COUNT_QC_HIGH = 1000;

type DensityMetricKey = 'density_low_percent' | 'density_medium_percent' | 'density_high_percent';

const DENSITY_SEGMENTS: Array<{ key: DensityMetricKey; label: string; color: string; textColor: string }> = [
  { key: 'density_low_percent', label: 'Düşük', color: 'bg-emerald-500', textColor: 'text-emerald-700' },
  { key: 'density_medium_percent', label: 'Orta', color: 'bg-amber-400', textColor: 'text-amber-700' },
  { key: 'density_high_percent', label: 'Yüksek', color: 'bg-rose-500', textColor: 'text-rose-700' },
];

const getDensityValue = (phenotyping: any, key: DensityMetricKey): number | null => {
  const value = phenotyping?.[key] ?? phenotyping?.yogunluk_analizi?.[key] ?? phenotyping?.density_analysis?.[key];
  return getNumericValue(value);
};

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
  { key: 'frond_count', label: 'Yaprak sayısı', unit: '', digits: 0 },
  { key: 'rg_ratio', label: 'R/G Oranı', unit: '', digits: 3 },
  { key: 'chlorophyll_index', label: 'Klorofil İndeksi', unit: '', digits: 3 },
  { key: 'fresh_biomass_g_m2', label: 'Taze Biyokütle', unit: 'g/m²', digits: 1 },
];

interface CompareFrameValidationSummary {
  missingMetricLabels: string[];
  availableMetricCount: number;
  totalMetricCount: number;
}

const getNumericValue = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const validateCompareFrameMetrics = (frame: any): CompareFrameValidationSummary => {
  const missingMetricLabels = COMPARE_METRICS
    .filter((metric) => getNumericValue(frame?.metrics?.[metric.key]) === null)
    .map((metric) => metric.label);

  const totalMetricCount = COMPARE_METRICS.length;
  const availableMetricCount = totalMetricCount - missingMetricLabels.length;

  return {
    missingMetricLabels,
    availableMetricCount,
    totalMetricCount,
  };
};

type DecisionContributionKey = 'rg_ratio' | 'mean_g' | 'glcm_entropy';

type DecisionWeights = Record<'rg_ratio_pct' | 'mean_g_pct' | 'glcm_entropy_pct', number>;

interface DecisionContributionConfig {
  key: DecisionContributionKey;
  weightKey: keyof DecisionWeights;
  label: string;
  description: string;
  color: string;
  digits: number;
  getSignal: (value: number | null) => number | null;
}

const DEFAULT_DECISION_WEIGHTS: DecisionWeights = {
  rg_ratio_pct: 0.4,
  mean_g_pct: 0.3,
  glcm_entropy_pct: 0.2,
};

const DECISION_CONTRIBUTIONS: DecisionContributionConfig[] = [
  {
    key: 'rg_ratio',
    weightKey: 'rg_ratio_pct',
    label: 'R/G oranı',
    description: 'R/G artışı',
    color: 'bg-orange-500',
    digits: 3,
    getSignal: (value) => value,
  },
  {
    key: 'mean_g',
    weightKey: 'mean_g_pct',
    label: 'Yeşil kanal',
    description: 'Yeşil kanal düşüşü',
    color: 'bg-emerald-500',
    digits: 3,
    getSignal: (value) => value === null ? null : 1 - value,
  },
  {
    key: 'glcm_entropy',
    weightKey: 'glcm_entropy_pct',
    label: 'Doku entropisi',
    description: 'Doku entropisi artışı',
    color: 'bg-violet-500',
    digits: 3,
    getSignal: (value) => value,
  },
];

const getDecisionWeights = (data: any): { weights: DecisionWeights; fromApi: boolean } => {
  const apiWeights = data?.metadata?.decision?.early_weights;
  const hasApiWeights = DECISION_CONTRIBUTIONS.every(({ weightKey }) => typeof apiWeights?.[weightKey] === 'number');

  return {
    weights: hasApiWeights ? apiWeights : DEFAULT_DECISION_WEIGHTS,
    fromApi: hasApiWeights,
  };
};

const formatDecisionValue = (value: number | null, digits = 3) => (
  value === null ? 'Veri yok' : value.toFixed(digits)
);

type QcLevel = 'reliable' | 'warning' | 'low';

interface QcMetricConfig {
  key: string;
  label: string;
  description: string;
  type?: 'percent' | 'boolean' | 'number' | 'text';
  digits?: number;
  unit?: string;
}

const QC_METRICS: QcMetricConfig[] = [
  { key: 'coverage_pct', label: 'Kapsama', description: 'Segmentasyon kapsama oranı', type: 'percent', digits: 1, unit: '%' },
  { key: 'otsu_valid', label: 'Otsu doğrulaması', description: 'Otsu eşiği kabul edilebilir mi?', type: 'boolean' },
  { key: 'plausible', label: 'Geometri uygunluğu', description: 'Maske ve yaprak geometrisi makul mü?', type: 'boolean' },
  { key: 'frond_count', label: 'Yaprak sayısı', description: 'Algılanan yaprak sayısı', type: 'number', digits: 0 },
  { key: 'mean_size_px', label: 'Ortalama boyut', description: 'Ortalama maske bileşeni boyutu', type: 'number', digits: 1, unit: 'px' },
  { key: 'method', label: 'Planlanan yöntem', description: 'Planlanan/raporlanan segmentasyon yöntemi', type: 'text' },
  { key: 'methodUsed', label: 'Kullanılan yöntem', description: 'Optimizasyon sonrası kullanılan yöntem', type: 'text' },
  { key: 'contrastScore', label: 'Kontrast skoru', description: 'Maske optimizasyon kontrast skoru', type: 'number', digits: 3 },
];

const getQcRawValue = (frame: any, key: string) => frame?.metrics?.[key] ?? frame?.[key];

const hasQcValue = (value: unknown) => value !== undefined && value !== null && value !== '';

const formatQcValue = (value: unknown, config: QcMetricConfig) => {
  if (!hasQcValue(value)) return 'Veri yok';

  if (config.type === 'boolean') {
    if (typeof value === 'boolean') return value ? 'Evet' : 'Hayır';
    return String(value);
  }

  if (config.type === 'number' || config.type === 'percent') {
    const numericValue = getNumericValue(value);
    if (numericValue === null) return String(value);
    return `${numericValue.toFixed(config.digits ?? 1)}${config.unit ?? ''}`;
  }

  return String(value);
};

const groupErrorsBySeverity = (errors: any[] = []) => errors.reduce((groups: Record<string, any[]>, error) => {
  const severity = String(error?.severity ?? 'unknown').toLowerCase();
  groups[severity] = [...(groups[severity] ?? []), error];
  return groups;
}, {});

const getQcLevelSummary = (frame: any): { level: QcLevel; label: string; detail: string } => {
  const status = String(frame?.status ?? '').toLowerCase();
  const errors = Array.isArray(frame?.errors) ? frame.errors : [];
  const hasCriticalError = errors.some((error: any) => ['critical', 'error'].includes(String(error?.severity ?? '').toLowerCase()));
  const hasWarning = errors.some((error: any) => ['warning', 'warn'].includes(String(error?.severity ?? '').toLowerCase()));
  const otsuValid = getQcRawValue(frame, 'otsu_valid');
  const plausible = getQcRawValue(frame, 'plausible');
  const coverage = getNumericValue(getQcRawValue(frame, 'coverage_pct'));
  const frondCount = getNumericValue(getQcRawValue(frame, 'frond_count'));
  const fallbackActive = status.includes('fallback') || status.includes('failed') || status.includes('degraded');

  if (status === 'failed' || hasCriticalError || otsuValid === false || plausible === false || coverage === 0 || frondCount === 0) {
    return {
      level: 'low',
      label: 'Düşük Güven',
      detail: 'Kritik hata, geçersiz eşik veya makul olmayan maske sinyali var.',
    };
  }

  if (fallbackActive || hasWarning || status.includes('optimized') || coverage === null || frondCount === null) {
    return {
      level: 'warning',
      label: 'Dikkat',
      detail: 'Çıktı kullanılabilir, ancak fallback/optimizasyon veya eksik QC alanı nedeniyle kontrol önerilir.',
    };
  }

  return {
    level: 'reliable',
    label: 'Güvenilir',
    detail: 'Segmentasyon ve maske optimizasyon sinyalleri tutarlı görünüyor.',
  };
};

const getQcStatusNotes = (frame: any) => {
  const status = String(frame?.status ?? 'unknown');
  const normalizedStatus = status.toLowerCase();
  const method = getQcRawValue(frame, 'method');
  const methodUsed = getQcRawValue(frame, 'methodUsed');
  const notes = [`Status: ${status}`];

  if (normalizedStatus.includes('fallback') || normalizedStatus.includes('failed') || normalizedStatus.includes('degraded')) {
    notes.push('Fallback/kesinti durumu bildirildi.');
  }

  if (normalizedStatus.includes('optimized')) {
    notes.push('Maske optimizasyonu aktif/başarılı görünüyor.');
  }

  if (hasQcValue(method) && hasQcValue(methodUsed) && method !== methodUsed) {
    notes.push(`Yöntem değişti: ${method} → ${methodUsed}`);
  }

  const qcConfidence = getNumericValue(frame?.qc_confidence);
  const ciLower = getNumericValue(frame?.confidence_interval?.lower);
  const ciUpper = getNumericValue(frame?.confidence_interval?.upper);
  if (qcConfidence !== null && qcConfidence < 0.6) {
    notes.push('Bu skorun belirsizliği yüksek.');
  }
  if (ciLower !== null && ciUpper !== null && (ciUpper - ciLower) > 0.35) {
    notes.push(`Bu skorun belirsizliği yüksek (GA: ${(ciLower * 100).toFixed(0)}–${(ciUpper * 100).toFixed(0)}%).`);
  }

  return notes;
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

const getImageUrlForMode = (frame: any, mode: CompareViewMode) => {
  const urls = frame?.image_urls ?? {};

  if (mode === 'rgb') return urls.rgb ?? '';
  if (mode === 'pseudo') return urls.pseudocolor ?? urls.rgb ?? '';
  if (mode === 'overlay') return urls.overlay ?? urls.pseudocolor ?? urls.rgb ?? '';

  return urls.isolated ?? urls.overlay ?? urls.pseudocolor ?? urls.rgb ?? '';
};

const getCompareImageUrl = (frame: any, mode: CompareViewMode) => getImageUrlForMode(frame, mode);

const formatFrameDateLabel = (frame: any) => {
  const rawTimestamp = frame?.parsed_timestamp ?? frame?.timestamp;
  if (!rawTimestamp) return 'Tarih yok';

  const timestampMs = Date.parse(String(rawTimestamp));
  if (!Number.isFinite(timestampMs)) return String(rawTimestamp);

  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestampMs));
};

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

const getFrameDateMs = (frame: any): number | null => {
  const rawTimestamp = frame?.parsed_timestamp ?? frame?.timestamp;
  if (!rawTimestamp) return null;

  const timestampMs = Date.parse(String(rawTimestamp));
  return Number.isFinite(timestampMs) ? timestampMs : null;
};

const getFramePairDeltaDays = (startFrame: any, endFrame: any, timeline?: any[], startIndex?: number, endIndex?: number): number | null => {
  const startMs = getFrameDateMs(startFrame);
  const endMs = getFrameDateMs(endFrame);

  if (startMs !== null && endMs !== null) {
    return (endMs - startMs) / (1000 * 60 * 60 * 24);
  }

  if (timeline && typeof startIndex === 'number' && typeof endIndex === 'number') {
    const step = endIndex > startIndex ? 1 : -1;
    let delta = 0;

    for (let index = startIndex + step; step > 0 ? index <= endIndex : index >= endIndex; index += step) {
      const frameDelta = getNumericValue(timeline[index]?.time_delta_days);
      if (frameDelta === null) return null;
      delta += step > 0 ? frameDelta : -frameDelta;
    }

    return delta;
  }

  return null;
};

const formatTimeDeltaLabel = (deltaDays: number | null) => {
  if (deltaDays === null || !Number.isFinite(deltaDays)) return 'Tarih farkı bilinmiyor';
  if (Math.abs(deltaDays) < Number.EPSILON) return '0 dakika';

  const sign = deltaDays > 0 ? '+' : '-';
  const absDays = Math.abs(deltaDays);
  const absHours = absDays * 24;
  const absMinutes = absHours * 60;

  if (absDays >= 1) {
    const days = Number.isInteger(absDays) ? absDays.toFixed(0) : absDays.toFixed(1);
    return `${sign}${days} gün`;
  }

  if (absHours >= 1) {
    const hours = Number.isInteger(absHours) ? absHours.toFixed(0) : absHours.toFixed(1);
    return `${sign}${hours} saat`;
  }

  const minutes = Math.max(1, Math.round(absMinutes));
  return `${sign}${minutes} dakika`;
};

const getClosestChronologicalPair = (timeline: any[]): [number, number] => {
  if (timeline.length <= 1) return [0, 0];

  let closestPair: [number, number] = [0, 1];
  let closestDelta = Number.POSITIVE_INFINITY;

  for (let index = 1; index < timeline.length; index += 1) {
    const delta = Math.abs(getFramePairDeltaDays(timeline[index - 1], timeline[index], timeline, index - 1, index) ?? Number.POSITIVE_INFINITY);
    if (delta < closestDelta) {
      closestDelta = delta;
      closestPair = [index - 1, index];
    }
  }

  return closestPair;
};


type ChartMetricKey =
  | 'score'
  | 'prob'
  | 'coverage'
  | 'fronds'
  | 'rg_ratio'
  | 'mean_g'
  | 'glcm_entropy'
  | 'mean_size_px'
  | 'chlorophyll_index'
  | 'fresh_biomass_g_m2'
  | 'stress_browning_percent'
  | 'stress_yellowing_percent';

interface ChartMetricConfig {
  key: ChartMetricKey;
  label: string;
  unit: string;
  digits: number;
  color: string;
  strokeDasharray?: string;
  reference?: {
    value: number;
    label: string;
    color: string;
    whenSelected?: ChartMetricKey;
  };
}

const CHART_METRICS: ChartMetricConfig[] = [
  { key: 'score', label: 'Stres Yoğunluğu', unit: '', digits: 3, color: '#ef4444' },
  {
    key: 'prob',
    label: 'Stres Olasılığı',
    unit: '%',
    digits: 1,
    color: '#0f172a',
    strokeDasharray: '3 6',
    reference: { value: 0.66, label: 'Stres eşiği %66', color: '#fb7185' },
  },
  { key: 'coverage', label: 'Kapsama', unit: '%', digits: 1, color: '#10b981', strokeDasharray: '6 4' },
  { key: 'fronds', label: 'Yaprak sayısı', unit: '', digits: 0, color: '#06b6d4', strokeDasharray: '8 4' },
  { key: 'rg_ratio', label: 'R/G Oranı', unit: '', digits: 3, color: '#f97316' },
  { key: 'mean_g', label: 'Ortalama Yeşil', unit: '', digits: 1, color: '#22c55e' },
  { key: 'glcm_entropy', label: 'GLCM Entropi', unit: '', digits: 3, color: '#a855f7' },
  { key: 'mean_size_px', label: 'Ortalama Boyut', unit: 'px', digits: 1, color: '#64748b' },
  {
    key: 'chlorophyll_index',
    label: 'Klorofil İndeksi',
    unit: '',
    digits: 3,
    color: '#84cc16',
    strokeDasharray: '2 4',
    reference: { value: 2.5, label: 'Düşük klorofil 2.5', color: '#65a30d' },
  },
  { key: 'fresh_biomass_g_m2', label: 'Taze Biyokütle', unit: 'g/m²', digits: 1, color: '#8b5cf6', strokeDasharray: '10 4' },
  {
    key: 'stress_browning_percent',
    label: 'Kahverengileşme',
    unit: '%',
    digits: 1,
    color: '#b45309',
    reference: { value: 25, label: 'Yüksek browning %25', color: '#92400e' },
  },
  {
    key: 'stress_yellowing_percent',
    label: 'Sararma',
    unit: '%',
    digits: 1,
    color: '#eab308',
    reference: { value: 25, label: 'Yüksek yellowing %25', color: '#ca8a04' },
  },
];

const DEFAULT_CHART_METRICS: ChartMetricKey[] = ['prob', 'score', 'fronds', 'mean_size_px', 'chlorophyll_index', 'fresh_biomass_g_m2'];

const getChartMetricValue = (frame: any, key: ChartMetricKey): number | null => {
  if (!frame) return null;

  if (key === 'score') return getNumericValue(frame.metrics?.mean_stress_score);
  if (key === 'prob') return getNumericValue(frame.metrics?.early_stress_prob);
  if (key === 'coverage') return getCoverageValue(frame);
  if (key === 'fronds') return getFrondValue(frame);
  if (key === 'chlorophyll_index' || key === 'fresh_biomass_g_m2' || key === 'stress_browning_percent' || key === 'stress_yellowing_percent') {
    return getPhenotypingValue(frame.phenotyping, key as PhenotypingMetricKey);
  }

  return getNumericValue(frame.metrics?.[key]);
};

const formatChartMetricValue = (value: number | null | undefined, metric: ChartMetricConfig) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Veri yok';
  const displayValue = metric.key === 'prob' ? value * 100 : value;
  return `${displayValue.toFixed(metric.digits)}${metric.unit}`;
};


type SummaryMetric = {
  label: string;
  value: string;
  detail: string;
};

type SummaryFinding = {
  finding_text: string;
  evidence: string;
  confidence: number;
};

type SummaryReport = {
  successfulFrames: number;
  totalFrames: number;
  metrics: SummaryMetric[];
  findings: SummaryFinding[];
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

type CompositeRiskBand = 'low' | 'medium' | 'high';

interface CompositeRiskScore {
  score: number;
  band: CompositeRiskBand;
  label: string;
  components: {
    stressProbability: number | null;
    coverageChangeRate: number | null;
    frondDensityDeviation: number | null;
    qcPenalty: number;
  };
}

const toPercentile = (values: number[], target: number): number | null => {
  if (!values.length || !Number.isFinite(target)) return null;
  const sorted = [...values].sort((a, b) => a - b);
  let below = 0;
  let equal = 0;
  for (const value of sorted) {
    if (value < target) below += 1;
    else if (value === target) equal += 1;
  }
  const percentile = (below + (equal * 0.5)) / sorted.length;
  return Math.max(0, Math.min(percentile, 1));
};

const getCompositeRiskBand = (score: number): CompositeRiskBand => {
  if (score >= 67) return 'high';
  if (score >= 34) return 'medium';
  return 'low';
};

const getCompositeRiskLabel = (score: number): string => {
  const band = getCompositeRiskBand(score);
  if (band === 'high') return 'Yüksek risk';
  if (band === 'medium') return 'Orta risk';
  return 'Düşük risk';
};

const computeCompositeRiskScore = (timeline: any[], currentFrame: any, currentIndex: number, qcSummary: { level: QcLevel }): CompositeRiskScore => {
  const stressProbability = getStressProbability(currentFrame);
  const coverageValues = timeline.map((frame) => getCoverageValue(frame)).filter((value): value is number => value !== null);
  const frondValues = timeline.map((frame) => getFrondValue(frame)).filter((value): value is number => value !== null);

  const currentCoverage = getCoverageValue(currentFrame);
  const previousFrame = currentIndex > 0 ? timeline[currentIndex - 1] : null;
  const previousCoverage = previousFrame ? getCoverageValue(previousFrame) : null;
  const coverageChangeRate = (currentCoverage !== null && previousCoverage !== null) ? currentCoverage - previousCoverage : null;

  const medianFrond = frondValues.length
    ? [...frondValues].sort((a, b) => a - b)[Math.floor(frondValues.length / 2)]
    : null;
  const frondDensityDeviation = (medianFrond !== null && getFrondValue(currentFrame) !== null)
    ? Math.abs((getFrondValue(currentFrame) as number) - medianFrond)
    : null;

  const qcPenalty = qcSummary.level === 'low' ? 1 : qcSummary.level === 'warning' ? 0.5 : 0;

  const stressPct = stressProbability === null ? 0.5 : Math.max(0, Math.min(stressProbability, 1));
  const coveragePct = coverageChangeRate === null ? 0.5 : (toPercentile(coverageValues, currentCoverage ?? 0) ?? 0.5);
  const frondPct = frondDensityDeviation === null ? 0.5 : (toPercentile(frondValues.map((v) => Math.abs(v - (medianFrond ?? v))), frondDensityDeviation) ?? 0.5);
  const qcPct = qcPenalty;

  const weightedLinear =
    (0.42 * stressPct) +
    (0.22 * coveragePct) +
    (0.21 * frondPct) +
    (0.15 * qcPct);
  const sigmoid = 1 / (1 + Math.exp(-7 * (weightedLinear - 0.5)));
  const score = Math.round(sigmoid * 100);

  return {
    score,
    band: getCompositeRiskBand(score),
    label: getCompositeRiskLabel(score),
    components: {
      stressProbability,
      coverageChangeRate,
      frondDensityDeviation,
      qcPenalty,
    },
  };
};


type RuleEngineConfig = {
  trendRule: {
    metric: 'stress';
    windowFrames: number;
    slopeThreshold: number;
    confidence: number;
  };
  thresholdDurationRule: {
    metric: 'stress';
    threshold: number;
    minFrames: number;
    confidence: number;
  };
  combinedRule: {
    qcReliableRatioMin: number;
    riskScoreMin: number;
    confidence: number;
  };
  contradictionRule: {
    stressThreshold: number;
    maxCoverageSupport: number;
    maxBrowningSupport: number;
    confidence: number;
  };
};

const SUMMARY_RULE_ENGINE: RuleEngineConfig = {
  trendRule: { metric: 'stress', windowFrames: 5, slopeThreshold: 0.03, confidence: 0.82 },
  thresholdDurationRule: { metric: 'stress', threshold: 0.7, minFrames: 3, confidence: 0.86 },
  combinedRule: { qcReliableRatioMin: 0.8, riskScoreMin: 67, confidence: 0.78 },
  contradictionRule: { stressThreshold: 0.7, maxCoverageSupport: 45, maxBrowningSupport: 12, confidence: 0.74 },
};

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

  const findings: SummaryFinding[] = [];
  const addFinding = (finding_text: string, evidence: string, confidence: number) => {
    findings.push({ finding_text, evidence, confidence: Math.max(0, Math.min(1, confidence)) });
  };

  const trendWindow = sourceFrames.slice(-SUMMARY_RULE_ENGINE.trendRule.windowFrames);
  if (trendWindow.length >= 2) {
    const trendDelta = (getStressProbability(trendWindow[trendWindow.length - 1]) ?? 0) - (getStressProbability(trendWindow[0]) ?? 0);
    if (trendDelta >= SUMMARY_RULE_ENGINE.trendRule.slopeThreshold) {
      addFinding(
        'Trend kuralı: Son framelerde stres artış eğilimi var.',
        `Metrik: early_stress_prob, aralık: son ${trendWindow.length} frame, eğim: +${(trendDelta * 100).toFixed(1)} yüzde puan.`,
        SUMMARY_RULE_ENGINE.trendRule.confidence,
      );
    } else if (trendDelta <= -SUMMARY_RULE_ENGINE.trendRule.slopeThreshold) {
      addFinding(
        'Trend kuralı: Son framelerde stres azalış eğilimi var.',
        `Metrik: early_stress_prob, aralık: son ${trendWindow.length} frame, eğim: ${(trendDelta * 100).toFixed(1)} yüzde puan.`,
        SUMMARY_RULE_ENGINE.trendRule.confidence,
      );
    }
  }

  let streak = 0;
  let maxStreak = 0;
  let streakStart = 0;
  let bestStart = 0;
  let bestEnd = 0;
  sourceFrames.forEach((frame, idx) => {
    const stress = getStressProbability(frame);
    if (stress !== null && stress > SUMMARY_RULE_ENGINE.thresholdDurationRule.threshold) {
      if (streak === 0) streakStart = idx;
      streak += 1;
      if (streak > maxStreak) {
        maxStreak = streak;
        bestStart = streakStart;
        bestEnd = idx;
      }
    } else {
      streak = 0;
    }
  });

  if (maxStreak >= SUMMARY_RULE_ENGINE.thresholdDurationRule.minFrames) {
    addFinding(
      'Eşik+süre kuralı: Stres eşiği yeterli süre boyunca aşıldı.',
      `Metrik: early_stress_prob > ${(SUMMARY_RULE_ENGINE.thresholdDurationRule.threshold * 100).toFixed(0)}%, frame aralığı: ${bestStart + 1}-${bestEnd + 1}, süre: ${maxStreak} frame.`,
      SUMMARY_RULE_ENGINE.thresholdDurationRule.confidence,
    );
  }

  if (stressChange.delta !== null && stressChange.delta > 0.05) {
    addFinding(`Stres artıyor: ilk başarılı karede ${(stressChange.first! * 100).toFixed(1)}%, son başarılı karede ${(stressChange.last! * 100).toFixed(1)}% (değişim ${formatSignedNumber(stressChange.delta * 100, 1, ' yüzde puan')}).`, `Metrik: early_stress_prob, frame aralığı: 1-${sourceFrames.length}.`, 0.72);
  } else if (stressChange.delta !== null && stressChange.delta < -0.05) {
    addFinding(`Stres azalıyor: ilk başarılı karede ${(stressChange.first! * 100).toFixed(1)}%, son başarılı karede ${(stressChange.last! * 100).toFixed(1)}% (değişim ${formatSignedNumber(stressChange.delta * 100, 1, ' yüzde puan')}).`, `Metrik: early_stress_prob, frame aralığı: 1-${sourceFrames.length}.`, 0.72);
  }

  if (avgStressValue !== null && avgStressValue >= 0.6) {
    addFinding(`Ortalama stres yüksek: başarılı kare ortalaması ${(avgStressValue * 100).toFixed(1)}% ve eşik %60 üzerinde.`, `Metrik: early_stress_prob ortalama, frame aralığı: 1-${sourceFrames.length}.`, 0.7);
  }

  if (maxStressValue !== null && maxStressValue >= 0.8) {
    addFinding(`Maksimum stres kritik: en yüksek değer ${(maxStressValue * 100).toFixed(1)}% ve eşik %80 üzerinde.`, `Metrik: early_stress_prob max, frame aralığı: 1-${sourceFrames.length}.`, 0.76);
  }

  if (coverageChange.delta !== null && coverageChange.delta < -2) {
    addFinding(`Kapsama düşüyor: ${coverageChange.first!.toFixed(1)}% → ${coverageChange.last!.toFixed(1)}% (değişim ${formatSignedNumber(coverageChange.delta, 1, ' yüzde puan')}).`, `Metrik: coverage_percent, frame aralığı: 1-${sourceFrames.length}.`, 0.73);
  }

  if (latestChlorophyll !== null && latestChlorophyll < 2.5) {
    addFinding(`Klorofil düşük: son ölçüm ${latestChlorophyll.toFixed(3)} ve 2.500 eşik değerinin altında.`, `Metrik: chlorophyll_index, frame: ${sourceFrames.length}.`, 0.71);
  }

  if (latestCoverage !== null && latestCoverage > 85) {
    addFinding(`Yoğunluk yüksek: son kapsama ${latestCoverage.toFixed(1)}%, su yüzeyi/alan sıkışması riski artabilir.`, `Metrik: coverage_percent, frame: ${sourceFrames.length}.`, 0.64);
  }

  if (latestFronds !== null && latestFronds > 1000) {
    addFinding(`Yaprak yoğunluğu yüksek: son yaprak sayısı ${latestFronds.toFixed(0)}, ayrışma/üst üste binme kaynaklı yoğunluk riski izlenmeli.`, `Metrik: frond_count, frame: ${sourceFrames.length}.`, 0.66);
  }

  if (latestReliable === false || unreliableCount > 0) {
    addFinding(`QC düşük: ${unreliableCount}/${sourceFrames.length} başarılı karede güvenilirlik veya yaprak geometri uygunluğu uyarısı var.`, `Metrik: is_reliable/plausible, frame aralığı: 1-${sourceFrames.length}.`, 0.8);
  }

  if (biomassTrend.delta !== null && biomassTrend.delta < 0) {
    addFinding(`Biyokütle trendi negatif: ${biomassTrend.first!.toFixed(1)} g/m² → ${biomassTrend.last!.toFixed(1)} g/m² (değişim ${formatSignedNumber(biomassTrend.delta, 1, ' g/m²')}).`, `Metrik: fresh_biomass_g_m2, frame aralığı: 1-${sourceFrames.length}.`, 0.74);
  }



  const reliableFrames = sourceFrames.filter((frame) => frame.metrics?.is_reliable !== false && frame.metrics?.plausible !== false);
  const reliableRatio = sourceFrames.length ? reliableFrames.length / sourceFrames.length : 0;
  const avgRiskScore = reliableFrames.length
    ? average(reliableFrames.map((frame, idx) => computeCompositeRiskScore(reliableFrames, frame, idx, { level: 'good' }).score))
    : null;

  if (reliableRatio >= SUMMARY_RULE_ENGINE.combinedRule.qcReliableRatioMin && avgRiskScore !== null && avgRiskScore >= SUMMARY_RULE_ENGINE.combinedRule.riskScoreMin) {
    addFinding(
      'Kombine kural: QC iyi ancak risk yüksek, biyolojik stres şüphesi.',
      `Metrikler: QC reliable oranı ${(reliableRatio * 100).toFixed(0)}%, ortalama bileşik risk ${avgRiskScore.toFixed(1)}.`,
      SUMMARY_RULE_ENGINE.combinedRule.confidence,
    );
  }

  if (maxStressValue !== null && maxStressValue >= SUMMARY_RULE_ENGINE.contradictionRule.stressThreshold) {
    const coverageSupport = latestCoverage ?? 0;
    const browningSupport = getPhenotypingValue(sourceFrames[sourceFrames.length - 1]?.phenotyping, 'stress_browning_percent') ?? 0;
    if (coverageSupport <= SUMMARY_RULE_ENGINE.contradictionRule.maxCoverageSupport && browningSupport <= SUMMARY_RULE_ENGINE.contradictionRule.maxBrowningSupport) {
      addFinding(
        'Çelişki kuralı: Model stres sinyali veriyor ancak renk/kapsama sinyalleri desteklemiyor.',
        `Metrikler: max stress ${(maxStressValue * 100).toFixed(1)}%, coverage ${coverageSupport.toFixed(1)}%, browning ${browningSupport.toFixed(1)}%.`,
        SUMMARY_RULE_ENGINE.contradictionRule.confidence,
      );
    }
  }

  if (sourceFrames.length === 0) {
    addFinding('Başarılı timeline karesi bulunamadı; deterministik özet için kullanılabilir metrik yok.', 'Metrik yok, başarılı frame sayısı 0.', 0.95);
  } else if (findings.length === 0) {
    addFinding('Belirgin deterministik uyarı oluşmadı: stres, kapsama, klorofil, yoğunluk ve QC kuralları kritik eşikleri aşmadı.', `İncelenen frame aralığı: 1-${sourceFrames.length}.`, 0.6);
  }

  return {
    successfulFrames: successfulFrames.length,
    totalFrames: timeline.length,
    metrics: [
      {
        label: 'Ortalama stres',
        value: avgStressValue === null ? 'Veri yok' : `${(avgStressValue * 100).toFixed(1)}%`,
        detail: `${stressValues.length} başarılı kare üzerinden erken stres olasılığı ortalaması`,
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
        label: 'Yaprak sayısı değişimi',
        value: formatSignedNumber(frondChange.delta, 0, ''),
        detail: frondChange.first === null ? 'Veri yok' : `${frondChange.first.toFixed(0)} → ${frondChange.last!.toFixed(0)} yaprak (${formatPercentChange(frondChange.percentChange)})`,
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
  const [viewMode, setViewMode] = useState<CompareViewMode>('isolated');
  const [compareViewMode, setCompareViewMode] = useState<CompareViewMode>('isolated');
  const [activeTab, setActiveTab] = useState<'analysis' | 'stats' | 'insights'>('analysis');
  const [interpretation, setInterpretation] = useState<string>('');
  const [interpretationError, setInterpretationError] = useState<string>('');
  const [isInterpreting, setIsInterpreting] = useState(false);
  const [selectedChartMetrics, setSelectedChartMetrics] = useState<ChartMetricKey[]>(DEFAULT_CHART_METRICS);
  const [normalizeChart, setNormalizeChart] = useState(true);

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
    const timeline = data?.timeline ?? [];
    const frameCount = timeline.length;
    if (frameCount === 0) return;

    const [defaultStartIndex, defaultEndIndex] = getClosestChronologicalPair(timeline);
    setCompareStartIndex(defaultStartIndex);
    setCompareEndIndex(defaultEndIndex);
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
        <p className="text-sm font-semibold text-slate-500 animate-pulse">Fizyolojik harita oluşturuluyor...</p>
      </div>
    );
  }

  if (error || !data || !data.timeline || data.timeline.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] gap-6 p-8 text-center bg-slate-50/50 rounded-3xl border-2 border-dashed border-slate-200 m-8">
        <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center text-rose-500 shadow-sm ring-8 ring-rose-50">
           <AlertCircle size={40} />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-black text-slate-900">Analiz Verisi Yüklenemedi</h2>
          <p className="text-sm text-slate-500 max-w-sm mx-auto font-medium">
            {error || 'Sunucu ile bağlantı kurulamadı veya veriler henüz işlenmedi. Lütfen sayfayı yenileyin veya tekrar yükleme yapın.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => window.location.reload()}
            className="px-10 py-4 bg-slate-900 text-white rounded-2xl text-sm font-bold hover:bg-slate-800 transition-all shadow-sm active:scale-95"
          >
            Yeniden Dene
          </button>
          <button 
            onClick={() => window.dispatchEvent(new CustomEvent('change-view', { detail: 'upload' }))}
            className="px-10 py-4 bg-white border-2 border-slate-100 text-slate-500 rounded-2xl text-sm font-bold hover:bg-slate-50 transition-all active:scale-95"
          >
            Yükleme Ekranı
          </button>
        </div>
      </div>
    );
  }

  const currentFrame = data.timeline[currentIndex] || data.timeline[0];
  
  if (!currentFrame) return null;

  const { weights: decisionWeights, fromApi: decisionWeightsFromApi } = getDecisionWeights(data);
  const decisionProbability = getNumericValue(currentFrame.metrics?.early_stress_prob ?? currentFrame.decision?.early_stress_prob);
  const decisionContributionRows = DECISION_CONTRIBUTIONS.map((contribution) => {
    const rawValue = getNumericValue(currentFrame.metrics?.[contribution.key]);
    const signalValue = contribution.getSignal(rawValue);
    const weight = decisionWeights[contribution.weightKey];
    const contributionValue = signalValue === null ? null : signalValue * weight;

    return {
      ...contribution,
      rawValue,
      signalValue,
      weight,
      contributionValue,
      barWidth: contributionValue === null ? 0 : Math.max(0, Math.min(contributionValue, 1)) * 100,
    };
  });
  
  const handleDownload = (mode: CompareViewMode = viewMode) => {
    if (!currentFrame) return;
    const url = getImageUrlForMode(currentFrame, mode);
    if (!url) return;

    const link = document.createElement('a');
    link.href = url;
    link.download = `azolla_export_frame_${currentIndex + 1}_${mode}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadCsv = () => {
    if (!data?.timeline?.length) return;

    const headers = [
      'frame',
      'timestamp',
      'status',
      ...COMPARE_METRICS.map((metric) => metric.key),
      'rgb_url',
      'pseudocolor_url',
      'overlay_url',
      'isolated_url',
    ];
    const escapeCsvCell = (value: unknown) => {
      if (value === null || value === undefined) return '';
      const text = String(value);
      return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const rows = data.timeline.map((frame: any, index: number) => [
      `FRAME_${String(index + 1).padStart(2, '0')}`,
      frame?.timestamp ?? frame?.parsed_timestamp ?? '',
      frame?.status ?? '',
      ...COMPARE_METRICS.map((metric) => getCompareMetricValue(frame, metric.key) ?? ''),
      frame?.image_urls?.rgb ?? '',
      frame?.image_urls?.pseudocolor ?? '',
      frame?.image_urls?.overlay ?? '',
      frame?.image_urls?.isolated ?? '',
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map(escapeCsvCell).join(','))
      .join('\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `azolla_full_batch_report_${taskId}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const metricStats = CHART_METRICS.reduce((acc, metric) => {
    const values = data.timeline
      .map((frame: any) => getChartMetricValue(frame, metric.key))
      .filter((value: number | null): value is number => value !== null);
    const min = values.length > 0 ? Math.min(...values) : null;
    const max = values.length > 0 ? Math.max(...values) : null;

    acc[metric.key] = {
      hasData: values.length > 0,
      min,
      max,
    };
    return acc;
  }, {} as Record<ChartMetricKey, { hasData: boolean; min: number | null; max: number | null }>);

  const normalizeChartValue = (key: ChartMetricKey, value: number | null) => {
    if (value === null) return null;
    const stats = metricStats[key];
    if (!stats || stats.min === null || stats.max === null) return null;
    const range = stats.max - stats.min;
    if (Math.abs(range) <= Number.EPSILON) return 0.5;
    return (value - stats.min) / range;
  };

  const getDisplayChartValue = (key: ChartMetricKey, value: number | null) => (
    normalizeChart ? normalizeChartValue(key, value) : value
  );

  const chartData = data.timeline.map((frame: any, idx: number) => {
    const rawValues = CHART_METRICS.reduce((acc, metric) => {
      acc[metric.key] = getChartMetricValue(frame, metric.key);
      return acc;
    }, {} as Record<ChartMetricKey, number | null>);

    const coverageSignal = frame?.time_series_signals?.coverage;
    const frondSignal = frame?.time_series_signals?.frond_count;
    const stressSignal = frame?.time_series_signals?.stress_score;
    return {
      time: idx,
      ...rawValues,
      change_points: {
        coverage: Boolean(coverageSignal?.change_point),
        frond_count: Boolean(frondSignal?.change_point),
        stress_score: Boolean(stressSignal?.change_point),
      },
      anomaly_scores: {
        coverage: getNumericValue(coverageSignal?.anomaly_score),
        frond_count: getNumericValue(frondSignal?.anomaly_score),
        stress_score: getNumericValue(stressSignal?.anomaly_score),
      },
      anomaly_flags: {
        coverage: Boolean(coverageSignal?.anomaly_flag),
        frond_count: Boolean(frondSignal?.anomaly_flag),
        stress_score: Boolean(stressSignal?.anomaly_flag),
      },
      phenoCoverage: normalizePercent(rawValues.coverage),
      phenoChlorophyll: normalizeChlorophyll(rawValues.chlorophyll_index),
      phenoBiomass: normalizeChartValue('fresh_biomass_g_m2', rawValues.fresh_biomass_g_m2),
      phenoCoverageRaw: rawValues.coverage,
      phenoChlorophyllRaw: rawValues.chlorophyll_index,
      phenoBiomassRaw: rawValues.fresh_biomass_g_m2,
      ...CHART_METRICS.reduce((acc, metric) => {
        acc[`${metric.key}Display`] = getDisplayChartValue(metric.key, rawValues[metric.key]);
        return acc;
      }, {} as Record<string, number | null>),
    };
  });

  const selectedChartMetricConfigs = CHART_METRICS.filter((metric) => selectedChartMetrics.includes(metric.key));
  const enabledSelectedChartMetricConfigs = selectedChartMetricConfigs.filter((metric) => metricStats[metric.key]?.hasData);
  const rawChartValues = selectedChartMetricConfigs.flatMap((metric) => chartData
    .map((row: any) => row[metric.key])
    .filter((value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)));
  const rawMin = rawChartValues.length > 0 ? Math.min(...rawChartValues) : 0;
  const rawMax = rawChartValues.length > 0 ? Math.max(...rawChartValues) : 1;
  const rawPadding = Math.max((rawMax - rawMin) * 0.1, 1);
  const chartDomain = normalizeChart ? [0, 1] : [rawMin - rawPadding, rawMax + rawPadding];

  const getReferenceLineValue = (metric: ChartMetricConfig) => {
    if (!metric.reference || !selectedChartMetrics.includes(metric.key) || !metricStats[metric.key]?.hasData) return null;
    return normalizeChart ? normalizeChartValue(metric.key, metric.reference.value) : metric.reference.value;
  };

  const toggleChartMetric = (key: ChartMetricKey) => {
    if (!metricStats[key]?.hasData) return;
    setSelectedChartMetrics((selected) => (
      selected.includes(key)
        ? selected.filter((selectedKey) => selectedKey !== key)
        : [...selected, key]
    ));
  };

  const compareStartFrame = data.timeline[compareStartIndex] || data.timeline[0];
  const compareEndFrame = data.timeline[compareEndIndex] || data.timeline[Math.min(1, data.timeline.length - 1)] || data.timeline[0];
  const compareTimeDeltaDays = getFramePairDeltaDays(compareStartFrame, compareEndFrame, data.timeline, compareStartIndex, compareEndIndex);
  const compareTimeDeltaLabel = formatTimeDeltaLabel(compareTimeDeltaDays);
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
  const compareStartValidation = validateCompareFrameMetrics(compareStartFrame);
  const compareEndValidation = validateCompareFrameMetrics(compareEndFrame);
  const compareValidation = {
    start: compareStartValidation,
    end: compareEndValidation,
    hasMissingMetrics: compareStartValidation.missingMetricLabels.length > 0 || compareEndValidation.missingMetricLabels.length > 0,
  };
  const comparePrimaryDelta = compareRows.find((metric) => metric.key === 'coverage_pct') ?? compareRows.find((metric) => metric.hasData);
  const compareDeltaBadgeLabel = comparePrimaryDelta && comparePrimaryDelta.delta !== null
    ? `${comparePrimaryDelta.label} Δ ${formatCompareValue(comparePrimaryDelta.delta, comparePrimaryDelta, { signed: true, delta: true })}`
    : 'Delta metriği yok';

  const currentPhenotyping = currentFrame.phenotyping;
  const currentFrondCount = getNumericValue(currentFrame.metrics?.frond_count);
  const currentMeanFrondSize = getNumericValue(currentFrame.metrics?.mean_size_px);
  const frondQcMessage = currentFrondCount === null
    ? null
    : currentFrondCount < FROND_COUNT_QC_LOW
      ? `Yaprak sayısı çok düşük (${currentFrondCount.toFixed(0)}); tekil nesne ayrımı ve örnek temsil gücü QC kontrolü gerektirir.`
      : currentFrondCount > FROND_COUNT_QC_HIGH
        ? `Yaprak sayısı çok yüksek (${currentFrondCount.toFixed(0)}); üst üste binme ve segment birleşmeleri nedeniyle sayım QC kontrolü gerektirir.`
        : null;
  const densitySegments = DENSITY_SEGMENTS.map((segment) => {
    const value = getDensityValue(currentPhenotyping, segment.key);
    return {
      ...segment,
      value,
      width: value === null ? 0 : Math.max(0, Math.min(value, 100)),
    };
  });
  const densityTotal = densitySegments.reduce((sum, segment) => sum + (segment.value ?? 0), 0);

  const qcRows = QC_METRICS.map((metric) => {
    const value = getQcRawValue(currentFrame, metric.key);
    const numericValue = getNumericValue(value);
    const ok = metric.type === 'boolean'
      ? value !== false
      : metric.key === 'coverage_pct'
        ? numericValue === null || numericValue > 0
        : metric.key === 'frond_count'
          ? numericValue === null || (numericValue >= FROND_COUNT_QC_LOW && numericValue <= FROND_COUNT_QC_HIGH)
          : true;

    return {
      ...metric,
      value,
      ok,
      displayValue: formatQcValue(value, metric),
      score: ok ? 100 : 35,
    };
  });
  const hasQcFields = qcRows.some((metric) => hasQcValue(metric.value))
    || hasQcValue(currentFrame.status)
    || (Array.isArray(currentFrame.errors) && currentFrame.errors.length > 0);
  const qcSummary = getQcLevelSummary(currentFrame);
  const qcStatusNotes = getQcStatusNotes(currentFrame);
  const errorsBySeverity = groupErrorsBySeverity(Array.isArray(currentFrame.errors) ? currentFrame.errors : []);
  const errorSeverityEntries = Object.entries(errorsBySeverity) as Array<[string, any[]]>;
  const compositeRisk = computeCompositeRiskScore(data.timeline, currentFrame, currentIndex, qcSummary);
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
    name: key === 'HEALTHY' ? 'Sağlıklı' : key === 'STRESSED' ? 'Stresli' : 'Bilinmiyor',
    value: statusCounts[key],
    color: key === 'HEALTHY' ? '#10b981' : key === 'STRESSED' ? '#ef4444' : '#f59e0b'
  }));

  const analysisModel = {
    data,
    currentFrame,
    currentIndex,
    setCurrentIndex,
    compareStartIndex,
    compareEndIndex,
    setCompareStartIndex,
    setCompareEndIndex,
    viewMode,
    setViewMode,
    compareViewMode,
    setCompareViewMode,
    activeTab,
    setActiveTab,
    interpretation,
    interpretationError,
    isInterpreting,
    normalizeChart,
    setNormalizeChart,
    selectedChartMetrics,
    decisionProbability,
    decisionWeightsFromApi,
    decisionContributionRows,
    handleDownload,
    downloadCsv,
    metricStats,
    chartData,
    selectedChartMetricConfigs,
    enabledSelectedChartMetricConfigs,
    chartDomain,
    getReferenceLineValue,
    toggleChartMetric,
    compareStartFrame,
    compareEndFrame,
    compareTimeDeltaLabel,
    compareRows,
    compareValidation,
    comparePrimaryDelta,
    currentPhenotyping,
    currentFrondCount,
    currentMeanFrondSize,
    frondQcNote: frondQcMessage ?? 'Yaprak sayımı beklenen kalite aralığında görünüyor.',
    densityRows: densitySegments,
    qcRows,
    qcHasDetailedData: hasQcFields,
    qcSummary,
    qcConfidence: getNumericValue(currentFrame?.qc_confidence),
    qcConfidenceInterval: currentFrame?.confidence_interval ?? null,
    qcStatusNotes,
    compositeRisk,
    errorsBySeverity,
    errorSeverityEntries,
    stressBreakdownMetrics,
    totalFrames,
    avgStress,
    peakStress,
    avgCoverage,
    growthRate,
    statusCounts,
    summaryReport,
    pieData,
    CHART_METRICS,
    PHENOTYPING_METRICS,
    PHENOTYPING_CARD_STYLES,
    getPhenotypingValue,
    formatPhenotypingValue,
    formatStressMetricValue,
    getStressRiskClass: (risk: StressRiskLevel) => risk === 'high' ? 'bg-rose-100 text-rose-700' : risk === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700',
    getCompareImageUrl,
    formatFrameDateLabel,
    formatCompareValue,
    formatSignedNumber,
    formatPercentChange,
    formatDecisionValue,
  };

  return <AnalysisLayout model={analysisModel} />;
}
