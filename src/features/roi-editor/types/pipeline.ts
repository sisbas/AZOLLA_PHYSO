export type IsolationMethod = 'threshold' | 'fixed-rect';

export interface ROIIsolationConfig {
  method: IsolationMethod;
  threshold: number;
  fixedRect?: { x: number; y: number; width: number; height: number };
  blurRadius: number;
}

export interface RegistrationConfig {
  maxShiftPx: number;
  sampleStep: number;
}

export interface QualityThresholds {
  minInlierRatio: number;
  maxDeltaRGB: number;
  minSSIM: number;
  minPSNR: number;
}

export interface PipelineConfig {
  isolation: ROIIsolationConfig;
  registration: RegistrationConfig;
  quality: QualityThresholds;
}

export interface RegistrationResult {
  shiftX: number;
  shiftY: number;
  inlierRatio: number;
}

export interface NormalizationStats {
  sourceMean: [number, number, number];
  referenceMean: [number, number, number];
  normalizedMean: [number, number, number];
}

export interface ScientificMetrics {
  ssim: number;
  psnr: number;
  deltaRGB: { R: number; G: number; B: number };
  deltaLuminance: number;
}

export interface PipelineRunResult {
  roiMaskCoverage: number;
  registration: RegistrationResult;
  normalization: NormalizationStats;
  metrics: ScientificMetrics;
  qualityWarnings: string[];
}
