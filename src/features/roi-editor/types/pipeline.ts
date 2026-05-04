// ROI Editor Types - Backend roi_editor modülü ile uyumlu

export type ROIMethod = 'threshold' | 'grabcut' | 'manual_mask' | 'adaptive';

export interface ROIParams {
  method: ROIMethod;
  thresh: number;
  rect?: { x: number; y: number; width: number; height: number };
  blurKernel: number;
  applySmoothing: boolean;
  block_size?: number;
  c?: number;
}

export interface RegistrationParams {
  n_keypoints: number;
  min_samples: number;
  residual_threshold: number;
  max_iterations: number;
  require_min_inlier_ratio: number;
}

export interface RegistrationResult {
  translation: [number, number];
  rotation_deg: number;
  scale: number;
  inlier_ratio: number;
  n_matches: number;
  n_inliers: number;
  success: boolean;
  error_message?: string;
}

export interface NormalizationParams {
  channels: number[];
  use_roi_only: boolean;
  clip_values: boolean;
  min_value: number;
  max_value: number;
}

export interface NormalizationStats {
  R_mean_source: number;
  R_mean_reference: number;
  R_mean_matched: number;
  R_std_source: number;
  R_std_reference: number;
  G_mean_source: number;
  G_mean_reference: number;
  G_mean_matched: number;
  G_std_source: number;
  G_std_reference: number;
  B_mean_source: number;
  B_mean_reference: number;
  B_mean_matched: number;
  B_std_source: number;
  B_std_reference: number;
  overall_mean_shift: number;
  channels: number[];
}

export interface MetricsConfig {
  ssim_threshold: number;
  psnr_threshold_db: number;
  color_delta_threshold: number;
  compute_per_channel: boolean;
}

export interface ScientificMetrics {
  ssim: number;
  ssim_per_channel?: { R: number; G: number; B: number };
  psnr: number;
  delta_r: number;
  delta_g: number;
  delta_b: number;
  delta_rgb_mean: number;
  delta_luminance: number;
  quality_score: number;
  passes_ssim_threshold: boolean;
  passes_psnr_threshold: boolean;
  passes_color_threshold: boolean;
  overall_pass: boolean;
}

export interface PipelineConfig {
  roi: ROIParams;
  registration: RegistrationParams;
  normalization: NormalizationParams;
  metrics: MetricsConfig;
}

export interface PipelineRunResult {
  mask: Uint8Array;
  registered_image?: ImageData;
  normalized_image: ImageData;
  registration: RegistrationResult;
  normalization: NormalizationStats;
  metrics: ScientificMetrics;
  qualityWarnings: string[];
  success: boolean;
}

export interface BatchConfig {
  roi_method: string;
  roi_thresh: number;
  roi_blur_kernel: number;
  reg_n_keypoints: number;
  reg_min_inlier_ratio: number;
  norm_use_roi_only: boolean;
  ssim_threshold: number;
  psnr_threshold_db: number;
  color_delta_threshold: number;
  save_processed_images: boolean;
  output_format: string;
  n_jobs: number;
}

export interface SingleImageResult {
  source_file: string;
  success: boolean;
  error_message?: string;
  translation_x: number;
  translation_y: number;
  rotation_deg: number;
  scale: number;
  inlier_ratio: number;
  n_matches: number;
  n_inliers: number;
  registration_success: boolean;
  R_mean_source: number;
  R_mean_reference: number;
  R_mean_matched: number;
  G_mean_source: number;
  G_mean_reference: number;
  G_mean_matched: number;
  B_mean_source: number;
  B_mean_reference: number;
  B_mean_matched: number;
  overall_mean_shift: number;
  ssim: number;
  psnr: number;
  delta_r: number;
  delta_g: number;
  delta_b: number;
  delta_rgb_mean: number;
  delta_luminance: number;
  quality_score: number;
  passes_ssim: boolean;
  passes_psnr: boolean;
  passes_color: boolean;
  overall_pass: boolean;
}

export interface BatchResult {
  total_images: number;
  successful: number;
  failed: number;
  passed_validation: number;
  results: SingleImageResult[];
  mean_ssim: number;
  std_ssim: number;
  mean_psnr: number;
  std_psnr: number;
  mean_quality_score: number;
}
