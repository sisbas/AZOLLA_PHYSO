// ROI Editor Pipeline Module - Backend roi_editor/batch_processor.py ile uyumlu
import type { PipelineConfig, PipelineRunResult } from '../types/pipeline';
import { isolateROI } from './isolation';
import { registerImages } from './registration';
import { normalizeToReference } from './normalization';
import { computeScientificMetrics } from './metrics';

/**
 * Bilimsel görüntü işleme pipeline'ını çalıştırır.
 * Backend'deki ScientificBatchComparator.process_single fonksiyonu ile aynı mantık.
 */
export function runScientificPipeline(
  source: ImageData,
  reference: ImageData,
  cfg: PipelineConfig
): PipelineRunResult {
  try {
    // 1. ROI izolasyonu
    const mask = isolateROI(source, cfg.roi);

    // 2. Registration (hizalama)
    const { registered, result: registrationResult } = registerImages(
      source,
      reference,
      mask,
      cfg.registration
    );

    // 3. Normalizasyon
    const { matched, stats: normStats } = normalizeToReference(
      registered,
      reference,
      mask,
      cfg.normalization
    );

    // 4. Metrik hesaplama
    const metrics = computeScientificMetrics(
      source,
      reference,
      matched,
      mask,
      cfg.metrics
    );

    // 5. Kalite uyarıları
    const warnings: string[] = [];

    if (!registrationResult.success) {
      warnings.push(`Registration başarısız: ${registrationResult.error_message || 'Bilinmeyen hata'}`);
    } else if (registrationResult.inlier_ratio < cfg.registration.require_min_inlier_ratio) {
      warnings.push(`Düşük inlier oranı: ${registrationResult.inlier_ratio.toFixed(2)}`);
    }

    if (!metrics.passes_ssim_threshold) {
      warnings.push(`SSIM eşiği sağlanamadı: ${metrics.ssim.toFixed(4)} < ${cfg.metrics.ssim_threshold}`);
    }

    if (!metrics.passes_psnr_threshold) {
      warnings.push(`PSNR eşiği sağlanamadı: ${metrics.psnr.toFixed(2)} dB < ${cfg.metrics.psnr_threshold_db} dB`);
    }

    if (!metrics.passes_color_threshold) {
      warnings.push(`Renk farkı eşiği aşıldı: ΔRGB=${metrics.delta_rgb_mean.toFixed(2)} > ${cfg.metrics.color_delta_threshold}`);
    }

    return {
      mask,
      registered_image: registered,
      normalized_image: matched,
      registration: registrationResult,
      normalization: normStats,
      metrics,
      qualityWarnings: warnings,
      success: metrics.overall_pass && registrationResult.success
    };
  } catch (error) {
    // Hata durumunda boş sonuç döndür
    const errorResult: PipelineRunResult = {
      mask: new Uint8Array(source.width * source.height),
      normalized_image: source,
      registration: {
        translation: [0, 0],
        rotation_deg: 0,
        scale: 1.0,
        inlier_ratio: 0,
        n_matches: 0,
        n_inliers: 0,
        success: false,
        error_message: error instanceof Error ? error.message : 'Pipeline hatası'
      },
      normalization: {
        R_mean_source: 0,
        R_mean_reference: 0,
        R_mean_matched: 0,
        R_std_source: 0,
        R_std_reference: 0,
        G_mean_source: 0,
        G_mean_reference: 0,
        G_mean_matched: 0,
        G_std_source: 0,
        G_std_reference: 0,
        B_mean_source: 0,
        B_mean_reference: 0,
        B_mean_matched: 0,
        B_std_source: 0,
        B_std_reference: 0,
        overall_mean_shift: 0,
        channels: [0, 1, 2]
      },
      metrics: {
        ssim: 0,
        psnr: 0,
        delta_r: 0,
        delta_g: 0,
        delta_b: 0,
        delta_rgb_mean: 0,
        delta_luminance: 0,
        quality_score: 0,
        passes_ssim_threshold: false,
        passes_psnr_threshold: false,
        passes_color_threshold: false,
        overall_pass: false
      },
      qualityWarnings: [error instanceof Error ? error.message : 'Pipeline hatası'],
      success: false
    };
    return errorResult;
  }
}

/**
 * Varsayılan pipeline konfigürasyonu oluşturur
 */
export function createDefaultPipelineConfig(): PipelineConfig {
  return {
    roi: {
      method: 'threshold',
      thresh: 127,
      blurKernel: 5,
      applySmoothing: true
    },
    registration: {
      n_keypoints: 2000,
      min_samples: 3,
      residual_threshold: 2.0,
      max_iterations: 1000,
      require_min_inlier_ratio: 0.7
    },
    normalization: {
      channels: [0, 1, 2],
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
}

/**
 * Pipeline sonucu özet raporu oluşturur
 */
export function createPipelineSummary(result: PipelineRunResult): string {
  const status = result.success ? '✅ BAŞARILI' : '❌ BAŞARISIZ';

  let summary = `
=== ROI İŞLEME RAPORU ===
Durum: ${status}

📊 ROI MASKE:
  Kaplama: ${(result.mask.reduce((a, b) => a + b, 0) / result.mask.length * 100).toFixed(1)}%

🔄 REGISTRATION:
  Öteleme: [${result.registration.translation[0].toFixed(1)}, ${result.registration.translation[1].toFixed(1)}] px
  Rotasyon: ${result.registration.rotation_deg.toFixed(1)}°
  Ölçek: ${result.registration.scale.toFixed(3)}x
  Inlier Oranı: ${(result.registration.inlier_ratio * 100).toFixed(1)}%
  ${result.registration.success ? '✓' : '✗'} ${result.registration.success ? 'Başarılı' : 'Başarısız'}

🎨 NORMALİZASYON:
  Ortalama Kayma: ${result.normalization.overall_mean_shift.toFixed(2)}

📈 METRİKLER:
  SSIM: ${result.metrics.ssim.toFixed(4)}
  PSNR: ${result.metrics.psnr.toFixed(2)} dB
  ΔRGB: ${result.metrics.delta_rgb_mean.toFixed(2)}
  Kalite Skoru: ${result.metrics.quality_score.toFixed(3)}
`;

  if (result.qualityWarnings.length > 0) {
    summary += '\n⚠️ UYARILAR:\n';
    for (const warning of result.qualityWarnings) {
      summary += `  - ${warning}\n`;
    }
  }

  return summary;
}
