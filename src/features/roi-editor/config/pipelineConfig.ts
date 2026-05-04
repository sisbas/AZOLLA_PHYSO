// ROI Editor Configuration - Backend roi_editor/config.yaml ile uyumlu
import type { PipelineConfig } from '../types/pipeline';

/**
 * Varsayılan pipeline konfigürasyonu
 * Backend'deki config.yaml dosyası ile aynı değerler
 */
export const defaultPipelineConfig: PipelineConfig = {
  roi: {
    method: 'threshold',
    thresh: 127,
    blurKernel: 5,
    applySmoothing: true,
    block_size: 11,
    c: 2
  },
  registration: {
    n_keypoints: 2000,
    min_samples: 3,
    residual_threshold: 2.0,
    max_iterations: 1000,
    require_min_inlier_ratio: 0.7
  },
  normalization: {
    channels: [0, 1, 2], // R, G, B
    use_roi_only: true,
    clip_values: true,
    min_value: 0,
    max_value: 255
  },
  metrics: {
    ssim_threshold: 0.85,
    psnr_threshold_db: 25.0,
    color_delta_threshold: 15.0,
    compute_per_channel: true
  }
};

/**
 * Sıkı (strict) kalite ayarları
 */
export const strictPipelineConfig: PipelineConfig = {
  ...defaultPipelineConfig,
  metrics: {
    ...defaultPipelineConfig.metrics,
    ssim_threshold: 0.92,
    psnr_threshold_db: 30.0,
    color_delta_threshold: 10.0
  },
  registration: {
    ...defaultPipelineConfig.registration,
    require_min_inlier_ratio: 0.85
  }
};

/**
 * Esnek (lenient) kalite ayarları
 */
export const lenientPipelineConfig: PipelineConfig = {
  ...defaultPipelineConfig,
  metrics: {
    ...defaultPipelineConfig.metrics,
    ssim_threshold: 0.75,
    psnr_threshold_db: 20.0,
    color_delta_threshold: 20.0
  },
  registration: {
    ...defaultPipelineConfig.registration,
    require_min_inlier_ratio: 0.6
  }
};

/**
 * Batch işlem için varsayılan konfigürasyon
 */
export interface BatchProcessorConfig {
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

export const defaultBatchConfig: BatchProcessorConfig = {
  roi_method: 'threshold',
  roi_thresh: 127,
  roi_blur_kernel: 5,
  reg_n_keypoints: 2000,
  reg_min_inlier_ratio: 0.7,
  norm_use_roi_only: true,
  ssim_threshold: 0.85,
  psnr_threshold_db: 25.0,
  color_delta_threshold: 15.0,
  save_processed_images: true,
  output_format: 'png',
  n_jobs: 4
};

/**
 * Konfigürasyonu backend API formatına dönüştürür
 */
export function toBackendConfig(config: PipelineConfig): Record<string, any> {
  return {
    roi_method: config.roi.method,
    roi_thresh: config.roi.thresh,
    roi_blur_kernel: config.roi.blurKernel,
    reg_n_keypoints: config.registration.n_keypoints,
    reg_min_inlier_ratio: config.registration.require_min_inlier_ratio,
    norm_use_roi_only: config.normalization.use_roi_only,
    ssim_threshold: config.metrics.ssim_threshold,
    psnr_threshold_db: config.metrics.psnr_threshold_db,
    color_delta_threshold: config.metrics.color_delta_threshold
  };
}

/**
 * Backend API'den gelen konfigürasyonu frontend formatına dönüştürür
 */
export function fromBackendConfig(backendConfig: Record<string, any>): PipelineConfig {
  return {
    roi: {
      method: (backendConfig.roi_method as any) || 'threshold',
      thresh: backendConfig.roi_thresh ?? 127,
      blurKernel: backendConfig.roi_blur_kernel ?? 5,
      applySmoothing: true,
      block_size: backendConfig.block_size ?? 11,
      c: backendConfig.c ?? 2
    },
    registration: {
      n_keypoints: backendConfig.reg_n_keypoints ?? 2000,
      min_samples: 3,
      residual_threshold: 2.0,
      max_iterations: 1000,
      require_min_inlier_ratio: backendConfig.reg_min_inlier_ratio ?? 0.7
    },
    normalization: {
      channels: [0, 1, 2],
      use_roi_only: backendConfig.norm_use_roi_only ?? true,
      clip_values: true,
      min_value: 0,
      max_value: 255
    },
    metrics: {
      ssim_threshold: backendConfig.ssim_threshold ?? 0.85,
      psnr_threshold_db: backendConfig.psnr_threshold_db ?? 25.0,
      color_delta_threshold: backendConfig.color_delta_threshold ?? 15.0,
      compute_per_channel: true
    }
  };
}
