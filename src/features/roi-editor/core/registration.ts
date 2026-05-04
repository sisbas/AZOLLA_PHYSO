// ROI Editor Registration Module - Backend roi_editor/registration.py ile uyumlu
import type { RegistrationParams, RegistrationResult } from '../types/pipeline';

/**
 * Görüntü kaydı (registration) gerçekleştirir.
 * Backend'deki register_images fonksiyonu ile aynı mantık.
 * Not: Gerçek ORB/RANSAC için OpenCV.js gerekir, bu basitleştirilmiş bir versiyondur.
 */
export function registerImages(
  source: ImageData,
  reference: ImageData,
  mask?: Uint8Array,
  params?: Partial<RegistrationParams>
): { registered: ImageData; result: RegistrationResult } {
  const defaultParams: RegistrationParams = {
    n_keypoints: params?.n_keypoints || 2000,
    min_samples: params?.min_samples || 3,
    residual_threshold: params?.residual_threshold || 2.0,
    max_iterations: params?.max_iterations || 1000,
    require_min_inlier_ratio: params?.require_min_inlier_ratio || 0.7
  };

  try {
    // Basitleştirilmiş faz korelasyonu tabanlı registration
    // Backend'deki ORB/RANSAC yerine geçici çözüm
    const { translation, inlierRatio } = estimateTranslation(source, reference, mask);

    // Warp işlemi - kaynak görüntüyü ötele
    const registered = translateImage(source, translation[0], translation[1]);

    // Başarı kontrolü
    const success = inlierRatio >= defaultParams.require_min_inlier_ratio;

    const result: RegistrationResult = {
      translation,
      rotation_deg: 0, // Basitleştirilmiş - sadece öteleme
      scale: 1.0,
      inlier_ratio: inlierRatio,
      n_matches: 0, // Basitleştirilmiş
      n_inliers: 0,
      success,
      error_message: success ? undefined : `Düşük inlier oranı: ${inlierRatio.toFixed(2)}`
    };

    return { registered, result };
  } catch (error) {
    // Hata durumunda orijinal görüntüyü döndür
    const result: RegistrationResult = {
      translation: [0, 0],
      rotation_deg: 0,
      scale: 1.0,
      inlier_ratio: 0,
      n_matches: 0,
      n_inliers: 0,
      success: false,
      error_message: error instanceof Error ? error.message : 'Bilinmeyen hata'
    };
    return { registered: source, result };
  }
}

/**
 * Faz korelasyonu ile öteleme tahmini
 */
function estimateTranslation(
  source: ImageData,
  reference: ImageData,
  mask?: Uint8Array
): { translation: [number, number]; inlierRatio: number } {
  const w = Math.min(source.width, reference.width);
  const h = Math.min(source.height, reference.height);

  let bestShiftX = 0;
  let bestShiftY = 0;
  let bestScore = -Infinity;

  // Makul bir arama aralığı
  const maxShift = Math.min(50, Math.floor(w * 0.1));

  for (let sy = -maxShift; sy <= maxShift; sy += 2) {
    for (let sx = -maxShift; sx <= maxShift; sx += 2) {
      const score = computeCorrelationScore(source, reference, sx, sy, mask, 4);
      if (score > bestScore) {
        bestScore = score;
        bestShiftX = sx;
        bestShiftY = sy;
      }
    }
  }

  // Inlier oranını hesapla (0-1 arası)
  const inlierRatio = Math.max(0, Math.min(1, (bestScore + 1) / 2));

  return {
    translation: [bestShiftX, bestShiftY],
    inlierRatio
  };
}

/**
 * Korelasyon skoru hesaplama
 */
function computeCorrelationScore(
  source: ImageData,
  reference: ImageData,
  shiftX: number,
  shiftY: number,
  mask: Uint8Array | undefined,
  step: number
): number {
  const w = Math.min(source.width, reference.width);
  const h = Math.min(source.height, reference.height);
  let sum = 0;
  let n = 0;

  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      // Maske kontrolü
      if (mask && mask[y * w + x] === 0) continue;

      const bx = x + shiftX;
      const by = y + shiftY;
      if (bx < 0 || by < 0 || bx >= w || by >= h) continue;

      const is = (y * source.width + x) * 4;
      const ir = (by * reference.width + bx) * 4;

      const ls = 0.299 * source.data[is] + 0.587 * source.data[is + 1] + 0.114 * source.data[is + 2];
      const lr = 0.299 * reference.data[ir] + 0.587 * reference.data[ir + 1] + 0.114 * reference.data[ir + 2];

      sum += 1 - Math.abs(ls - lr) / 255;
      n++;
    }
  }

  return n ? (sum / n) * 2 - 1 : -1;
}

/**
 * Görüntüyü ötele (translate)
 */
function translateImage(
  source: ImageData,
  dx: number,
  dy: number
): ImageData {
  const { width, height, data } = source;
  const result = new ImageData(width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcX = x - dx;
      const srcY = y - dy;

      const dstIdx = (y * width + x) * 4;

      if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
        const srcIdx = (srcY * width + srcX) * 4;
        result.data[dstIdx] = data[srcIdx];
        result.data[dstIdx + 1] = data[srcIdx + 1];
        result.data[dstIdx + 2] = data[srcIdx + 2];
        result.data[dstIdx + 3] = data[srcIdx + 3];
      } else {
        // Sınır dışı - siyah
        result.data[dstIdx] = 0;
        result.data[dstIdx + 1] = 0;
        result.data[dstIdx + 2] = 0;
        result.data[dstIdx + 3] = 255;
      }
    }
  }

  return result;
}

/**
 * Registration kalitesini değerlendirir
 */
export function computeRegistrationQuality(
  source: ImageData,
  reference: ImageData,
  registered: ImageData,
  mask?: Uint8Array
): { ssim_improvement: number; ssim_after: number; registration_effective: boolean } {
  // Basitleştirilmiş SSIM benzeri metrik
  const ssim_before = computeSimilarity(source, reference, mask);
  const ssim_after = computeSimilarity(registered, reference, mask);

  return {
    ssim_improvement: ssim_after - ssim_before,
    ssim_after,
    registration_effective: ssim_after > ssim_before
  };
}

/**
 * Basit yapısal benzerlik metriği
 */
function computeSimilarity(
  img1: ImageData,
  img2: ImageData,
  mask?: Uint8Array
): number {
  const w = Math.min(img1.width, img2.width);
  const h = Math.min(img1.height, img2.height);
  let sum = 0;
  let n = 0;

  for (let i = 0; i < w * h; i++) {
    if (mask && mask[i] === 0) continue;

    const idx = i * 4;
    const diff = (
      Math.abs(img1.data[idx] - img2.data[idx]) +
      Math.abs(img1.data[idx + 1] - img2.data[idx + 1]) +
      Math.abs(img1.data[idx + 2] - img2.data[idx + 2])
    ) / 3;

    sum += 1 - diff / 255;
    n++;
  }

  return n ? sum / n : 0;
}
