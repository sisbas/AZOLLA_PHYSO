// ROI Editor Isolation Module - Backend roi_editor/isolation.py ile uyumlu
import type { ROIParams, ROIMethod } from '../types/pipeline';

/**
 * ROI izolasyonu gerçekleştirir.
 * Backend'deki isolate_roi fonksiyonu ile aynı mantık.
 */
export function isolateROI(
  image: ImageData,
  params: ROIParams
): Uint8Array {
  const { data, width, height } = image;
  const mask = new Uint8Array(width * height);

  // Yönteme göre maske oluştur
  switch (params.method) {
    case 'threshold':
      thresholdIsolation(data, width, height, params.thresh, mask);
      break;
    case 'grabcut':
      grabcutIsolation(data, width, height, params.rect, mask);
      break;
    case 'adaptive':
      adaptiveIsolation(data, width, height, params.block_size || 11, params.c || 2, mask);
      break;
    case 'manual_mask':
      // Manuel maske zaten sağlanmış olmalı
      break;
    default:
      // Varsayılan threshold
      thresholdIsolation(data, width, height, params.thresh, mask);
  }

  // Kenar yumuşatma (anti-aliasing) - bilimsel geçerlilik için
  if (params.applySmoothing && params.blurKernel > 1) {
    return smoothMask(mask, width, height, params.blurKernel);
  }

  return mask;
}

/**
 * Threshold tabanlı ROI izolasyonu
 */
function thresholdIsolation(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  thresh: number,
  mask: Uint8Array
): void {
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    mask[i] = gray >= thresh ? 255 : 0;
  }
}

/**
 * GrabCut benzeri basit dikdörtgen izolasyonu
 * Not: Gerçek GrabCut için OpenCV.js gerekir
 */
function grabcutIsolation(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  rect: { x: number; y: number; width: number; height: number } | undefined,
  mask: Uint8Array
): void {
  // Varsayılan olarak görüntünün merkezinde bir dikdörtgen
  const defaultRect = rect || {
    x: Math.floor(width / 4),
    y: Math.floor(height / 4),
    width: Math.floor(width / 2),
    height: Math.floor(height / 2)
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      mask[i] = (
        x >= defaultRect.x &&
        x < defaultRect.x + defaultRect.width &&
        y >= defaultRect.y &&
        y < defaultRect.y + defaultRect.height
      ) ? 255 : 0;
    }
  }
}

/**
 * Adaptive threshold ile ROI izolasyonu
 */
function adaptiveIsolation(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  blockSize: number,
  c: number,
  mask: Uint8Array
): void {
  const halfBlock = Math.floor(blockSize / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const gray = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];

      // Yerel ortalamayı hesapla
      let sum = 0;
      let count = 0;
      for (let dy = -halfBlock; dy <= halfBlock; dy++) {
        for (let dx = -halfBlock; dx <= halfBlock; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const ni = ny * width + nx;
            sum += 0.299 * data[ni * 4] + 0.587 * data[ni * 4 + 1] + 0.114 * data[ni * 4 + 2];
            count++;
          }
        }
      }
      const localMean = sum / count;
      mask[i] = gray >= (localMean - c) ? 255 : 0;
    }
  }
}

/**
 * Maskeyi Gaussian blur ile yumuşatır
 */
function smoothMask(
  mask: Uint8Array,
  width: number,
  height: number,
  blurKernel: number
): Uint8Array {
  const out = new Float64Array(mask.length);
  const halfKernel = Math.floor(blurKernel / 2);

  // Gaussian kernel ağırlıkları (basitleştirilmiş)
  const kernel: number[] = [];
  for (let i = -halfKernel; i <= halfKernel; i++) {
    kernel.push(Math.exp(-(i * i) / (2 * ((blurKernel / 3) ** 2))));
  }

  // Normalize et
  const kernelSum = kernel.reduce((a, b) => a + b, 0);

  for (let y = halfKernel; y < height - halfKernel; y++) {
    for (let x = halfKernel; x < width - halfKernel; x++) {
      let weightedSum = 0;
      let weightTotal = 0;

      for (let ky = -halfKernel; ky <= halfKernel; ky++) {
        for (let kx = -halfKernel; kx <= halfKernel; kx++) {
          const nx = x + kx;
          const ny = y + ky;
          const ni = ny * width + nx;
          const weight = kernel[ky + halfKernel] * kernel[kx + halfKernel];
          weightedSum += mask[ni] * weight;
          weightTotal += weight;
        }
      }

      out[y * width + x] = weightedSum / weightTotal;
    }
  }

  // Float'tan uint8'e çevir ve sınırları koru
  const result = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) {
    result[i] = Math.max(0, Math.min(255, Math.round(out[i])));
  }

  return result;
}

/**
 * Sabit koordinatlar için maske oluşturur
 */
export function createFixedMask(
  width: number,
  height: number,
  roiCoords: { x: number; y: number; width: number; height: number }
): Uint8Array {
  const mask = new Uint8Array(width * height);
  const { x, y, width: rw, height: rh } = roiCoords;

  for (let iy = y; iy < y + rh && iy < height; iy++) {
    for (let ix = x; ix < x + rw && ix < width; ix++) {
      mask[iy * width + ix] = 255;
    }
  }

  return mask;
}
