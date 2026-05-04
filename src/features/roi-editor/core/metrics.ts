// ROI Editor Metrics Module - Backend roi_editor/metrics.py ile uyumlu
import type { ScientificMetrics, MetricsConfig } from '../types/pipeline';

/**
 * Bilimsel görüntü karşılaştırma metriklerini hesaplar.
 * Backend'deki compute_scientific_metrics fonksiyonu ile aynı mantık.
 */
export function computeScientificMetrics(
  source: ImageData,
  reference: ImageData,
  matched: ImageData,
  mask?: Uint8Array,
  config?: Partial<MetricsConfig>
): ScientificMetrics {
  const defaultConfig: MetricsConfig = {
    ssim_threshold: config?.ssim_threshold || 0.85,
    psnr_threshold_db: config?.psnr_threshold_db || 25.0,
    color_delta_threshold: config?.color_delta_threshold || 15.0,
    compute_per_channel: config?.compute_per_channel ?? true
  };

  // SSIM hesaplama
  const { ssim, ssim_per_channel } = computeSSIM(matched, reference, mask, defaultConfig.compute_per_channel);

  // PSNR hesaplama
  const psnr = computePSNR(matched, reference, mask);

  // Renk farkları (ΔRGB)
  const deltaRgb = computeDeltaRGB(matched, reference, mask);

  // Luminans farkı
  const deltaLum = computeDeltaLuminance(matched, reference, mask);

  // Kalite skoru (0-1 arası)
  const qualityScore = computeQualityScore(ssim, psnr, deltaRgb.mean, defaultConfig);

  // Validasyon bayrakları
  const passesSsim = ssim >= defaultConfig.ssim_threshold;
  const passesPsnr = psnr >= defaultConfig.psnr_threshold_db;
  const passesColor = deltaRgb.mean <= defaultConfig.color_delta_threshold;
  const overallPass = passesSsim && passesPsnr && passesColor;

  return {
    ssim,
    ssim_per_channel: ssim_per_channel as any,
    psnr,
    delta_r: deltaRgb.R,
    delta_g: deltaRgb.G,
    delta_b: deltaRgb.B,
    delta_rgb_mean: deltaRgb.mean,
    delta_luminance: deltaLum,
    quality_score: qualityScore,
    passes_ssim_threshold: passesSsim,
    passes_psnr_threshold: passesPsnr,
    passes_color_threshold: passesColor,
    overall_pass: overallPass
  };
}

/**
 * SSIM (Structural Similarity Index) hesaplama
 */
function computeSSIM(
  image1: ImageData,
  image2: ImageData,
  mask: Uint8Array | undefined,
  computePerChannel: boolean
): { ssim: number; ssim_per_channel: { R: number; G: number; B: number } | null } {
  if (mask) {
    return computeSSIMMasked(image1, image2, mask, computePerChannel);
  } else {
    return computeSSIMFull(image1, image2, computePerChannel);
  }
}

/**
 * Tüm görüntüde SSIM hesapla
 */
function computeSSIMFull(
  image1: ImageData,
  image2: ImageData,
  computePerChannel: boolean
): { ssim: number; ssim_per_channel: { R: number; G: number; B: number } | null } {
  const w = Math.min(image1.width, image2.width);
  const h = Math.min(image1.height, image2.height);

  let sum = 0;
  let n = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const idx1 = (y * image1.width + x) * 4;
      const idx2 = (y * image2.width + x) * 4;

      // Yerel pencere istatistikleri (basitleştirilmiş)
      const local1 = getLocalStats(image1, x, y, 3);
      const local2 = getLocalStats(image2, x, y, 3);

      const ssimLocal = computeLocalSSIM(local1, local2);
      sum += ssimLocal;
      n++;
    }
  }

  const ssim = n > 0 ? sum / n : 0;

  let ssim_per_channel: { R: number; G: number; B: number } | null = null;
  if (computePerChannel) {
    ssim_per_channel = {
      R: computeChannelSSIM(image1, image2, 0),
      G: computeChannelSSIM(image1, image2, 1),
      B: computeChannelSSIM(image1, image2, 2)
    };
  }

  return { ssim, ssim_per_channel };
}

/**
 * Maske bölgesinde SSIM hesapla
 */
function computeSSIMMasked(
  image1: ImageData,
  image2: ImageData,
  mask: Uint8Array,
  computePerChannel: boolean
): { ssim: number; ssim_per_channel: { R: number; G: number; B: number } | null } {
  const w = image1.width;
  const h = image1.height;

  let sum = 0;
  let n = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask[i] === 0) continue;

      const idx1 = (y * image1.width + x) * 4;
      const idx2 = (y * image2.width + x) * 4;

      const local1 = getLocalStats(image1, x, y, 3);
      const local2 = getLocalStats(image2, x, y, 3);

      const ssimLocal = computeLocalSSIM(local1, local2);
      sum += ssimLocal;
      n++;
    }
  }

  const ssim = n > 0 ? sum / n : 0;

  let ssim_per_channel: { R: number; G: number; B: number } | null = null;
  if (computePerChannel) {
    ssim_per_channel = {
      R: computeChannelSSIMMasked(image1, image2, mask, 0),
      G: computeChannelSSIMMasked(image1, image2, mask, 1),
      B: computeChannelSSIMMasked(image1, image2, mask, 2)
    };
  }

  return { ssim, ssim_per_channel };
}

/**
 * Yerel pencere istatistikleri
 */
function getLocalStats(image: ImageData, x: number, y: number, radius: number) {
  const { data, width, height } = image;
  const values: number[] = [];

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const idx = (ny * width + nx) * 4;
        const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        values.push(lum);
      }
    }
  }

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);

  return { mean, std };
}

/**
 * Yerel SSIM hesaplama
 */
function computeLocalSSIM(local1: { mean: number; std: number }, local2: { mean: number; std: number }): number {
  const C1 = (0.01 * 255) ** 2;
  const C2 = (0.03 * 255) ** 2;

  const mu1 = local1.mean;
  const mu2 = local2.mean;
  const sigma1 = local1.std;
  const sigma2 = local2.std;

  const mu1_mu2 = mu1 * mu2;
  const sigma1_sigma2 = sigma1 * sigma2;

  const numerator = (2 * mu1_mu2 + C1) * (2 * sigma1_sigma2 + C2);
  const denominator = (mu1 ** 2 + mu2 ** 2 + C1) * (sigma1 ** 2 + sigma2 ** 2 + C2);

  return numerator / denominator;
}

/**
 * Tek kanal SSIM hesaplama
 */
function computeChannelSSIM(image1: ImageData, image2: ImageData, channel: number): number {
  const w = Math.min(image1.width, image2.width);
  const h = Math.min(image1.height, image2.height);
  let sum = 0;
  let n = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx1 = (y * image1.width + x) * 4 + channel;
      const idx2 = (y * image2.width + x) * 4 + channel;
      const diff = Math.abs(image1.data[idx1] - image2.data[idx2]) / 255;
      sum += 1 - diff;
      n++;
    }
  }

  return n > 0 ? sum / n : 0;
}

/**
 * Tek kanal SSIM hesaplama (maske ile)
 */
function computeChannelSSIMMasked(image1: ImageData, image2: ImageData, mask: Uint8Array, channel: number): number {
  const w = image1.width;
  const h = image1.height;
  let sum = 0;
  let n = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask[i] === 0) continue;

      const idx1 = (y * image1.width + x) * 4 + channel;
      const idx2 = (y * image2.width + x) * 4 + channel;
      const diff = Math.abs(image1.data[idx1] - image2.data[idx2]) / 255;
      sum += 1 - diff;
      n++;
    }
  }

  return n > 0 ? sum / n : 0;
}

/**
 * PSNR (Peak Signal-to-Noise Ratio) hesaplama
 */
function computePSNR(image1: ImageData, image2: ImageData, mask?: Uint8Array): number {
  const w = Math.min(image1.width, image2.width);
  const h = Math.min(image1.height, image2.height);
  let mse = 0;
  let n = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask && mask[i] === 0) continue;

      const idx1 = (y * image1.width + x) * 4;
      const idx2 = (y * image2.width + x) * 4;

      for (let c = 0; c < 3; c++) {
        const diff = image1.data[idx1 + c] - image2.data[idx2 + c];
        mse += diff * diff;
      }
      n += 3;
    }
  }

  if (n === 0 || mse === 0) return 99;

  mse /= n;
  return 20 * Math.log10(255 / Math.sqrt(mse));
}

/**
 * Kanal bazlı ortalama mutlak fark
 */
function computeDeltaRGB(image1: ImageData, image2: ImageData, mask?: Uint8Array): { R: number; G: number; B: number; mean: number } {
  const w = Math.min(image1.width, image2.width);
  const h = Math.min(image1.height, image2.height);
  const deltas = [0, 0, 0];
  let n = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask && mask[i] === 0) continue;

      const idx1 = (y * image1.width + x) * 4;
      const idx2 = (y * image2.width + x) * 4;

      deltas[0] += Math.abs(image1.data[idx1] - image2.data[idx2]);
      deltas[1] += Math.abs(image1.data[idx1 + 1] - image2.data[idx2 + 1]);
      deltas[2] += Math.abs(image1.data[idx1 + 2] - image2.data[idx2 + 2]);
      n++;
    }
  }

  const safeN = Math.max(n, 1);
  return {
    R: deltas[0] / safeN,
    G: deltas[1] / safeN,
    B: deltas[2] / safeN,
    mean: (deltas[0] + deltas[1] + deltas[2]) / (3 * safeN)
  };
}

/**
 * Luminans farkı (CIE L* benzeri)
 */
function computeDeltaLuminance(image1: ImageData, image2: ImageData, mask?: Uint8Array): number {
  const w = Math.min(image1.width, image2.width);
  const h = Math.min(image1.height, image2.height);
  let lumDelta = 0;
  let n = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask && mask[i] === 0) continue;

      const idx1 = (y * image1.width + x) * 4;
      const idx2 = (y * image2.width + x) * 4;

      const lum1 = 0.299 * image1.data[idx1] + 0.587 * image1.data[idx1 + 1] + 0.114 * image1.data[idx1 + 2];
      const lum2 = 0.299 * image2.data[idx2] + 0.587 * image2.data[idx2 + 1] + 0.114 * image2.data[idx2 + 2];
      lumDelta += Math.abs(lum1 - lum2);
      n++;
    }
  }

  return n > 0 ? lumDelta / n : 0;
}

/**
 * Genel kalite skoru hesapla (0-1 arası)
 * Ağırlıklı ortalama:
 * - SSIM: %40
 * - PSNR (normalize): %30
 * - Renk farkı (ters): %30
 */
function computeQualityScore(ssim: number, psnr: number, deltaRgbMean: number, config: MetricsConfig): number {
  // SSIM zaten 0-1 arası
  const ssimScore = ssim;

  // PSNR'i 0-1 aralığına normalize et (0-40 dB skalasında)
  const psnrNormalized = Math.min(psnr / 40.0, 1.0);

  // Renk farkını ters çevir (küçük fark = yüksek skor)
  const colorScore = Math.max(0, 1.0 - (deltaRgbMean / config.color_delta_threshold));

  // Ağırlıklı ortalama
  const qualityScore = 0.4 * ssimScore + 0.3 * psnrNormalized + 0.3 * colorScore;

  return Math.max(0, Math.min(1, qualityScore));
}

/**
 * Metriklerden insan tarafından okunabilir rapor oluşturur
 */
export function createMetricsReport(metrics: ScientificMetrics): string {
  const status = metrics.overall_pass ? '✅ BAŞARILI' : '❌ BAŞARISIZ';

  let report = `
=== BİLİMSEL GÖRÜNTÜ KARŞILAŞTIRMA RAPORU ===
Durum: ${status}

📊 YAPISAL BENZERLİK:
  SSIM: ${metrics.ssim.toFixed(4)} (eşik: 0.85)
  ${metrics.passes_ssim_threshold ? '✓' : '✗'} SSIM eşiği ${metrics.passes_ssim_threshold ? 'geçildi' : 'geçilemedi'}

📡 SİNYAL KALİTESİ:
  PSNR: ${metrics.psnr.toFixed(2)} dB (eşik: 25.0)
  ${metrics.passes_psnr_threshold ? '✓' : '✗'} PSNR eşiği ${metrics.passes_psnr_threshold ? 'geçildi' : 'geçilemedi'}

🎨 RENK DOĞRULUĞU:
  ΔR: ${metrics.delta_r.toFixed(2)}
  ΔG: ${metrics.delta_g.toFixed(2)}
  ΔB: ${metrics.delta_b.toFixed(2)}
  Ortalama ΔRGB: ${metrics.delta_rgb_mean.toFixed(2)} (eşik: 15.0)
  ${metrics.passes_color_threshold ? '✓' : '✗'} Renk eşiği ${metrics.passes_color_threshold ? 'geçildi' : 'geçilemedi'}

💡 LUMİNANS FARKI:
  ΔLuminance: ${metrics.delta_luminance.toFixed(2)}

🏆 GENEL KALİTE SKORU:
  ${metrics.quality_score.toFixed(3)} / 1.000
`;

  if (metrics.ssim_per_channel) {
    report += `
📈 KANAL BAZLI SSIM:
  R: ${metrics.ssim_per_channel.R.toFixed(4)}
  G: ${metrics.ssim_per_channel.G.toFixed(4)}
  B: ${metrics.ssim_per_channel.B.toFixed(4)}
`;
  }

  return report;
}
