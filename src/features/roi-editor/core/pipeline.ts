import type { PipelineConfig, PipelineRunResult } from '../types/pipeline';
import { isolateROI } from './isolation';
import { registerByTranslation } from './registration';
import { normalizeToReference } from './normalization';
import { computeScientificMetrics } from './metrics';

export function runScientificPipeline(source: ImageData, reference: ImageData, cfg: PipelineConfig): PipelineRunResult {
  const mask = isolateROI(source, cfg.isolation);
  const coverage = mask.reduce((acc, v) => acc + v, 0) / mask.length;

  const registration = registerByTranslation(source, reference, cfg.registration);
  const { normalized, stats } = normalizeToReference(source, reference, mask);
  const metrics = computeScientificMetrics(reference, normalized, mask);

  const warnings: string[] = [];
  if (registration.inlierRatio < cfg.quality.minInlierRatio) warnings.push('Registration inlier_ratio düşük.');
  const meanDelta = (metrics.deltaRGB.R + metrics.deltaRGB.G + metrics.deltaRGB.B) / 3;
  if (meanDelta > cfg.quality.maxDeltaRGB) warnings.push('ΔRGB eşik üzerinde.');
  if (metrics.ssim < cfg.quality.minSSIM || metrics.psnr < cfg.quality.minPSNR) {
    warnings.push('SSIM/PSNR kalite eşiği sağlanamadı.');
  }

  return {
    roiMaskCoverage: coverage,
    registration,
    normalization: stats,
    metrics,
    qualityWarnings: warnings,
  };
}
