import type { ScientificMetrics } from '../types/pipeline';

export function computeScientificMetrics(reference: ImageData, normalized: ImageData, mask?: Uint8Array): ScientificMetrics {
  const deltas = [0, 0, 0];
  let mse = 0;
  let lumDelta = 0;
  let n = 0;

  for (let i = 0; i < reference.width * reference.height; i++) {
    if (mask && mask[i] === 0) continue;
    const idx = i * 4;
    const dr = Math.abs(normalized.data[idx] - reference.data[idx]);
    const dg = Math.abs(normalized.data[idx + 1] - reference.data[idx + 1]);
    const db = Math.abs(normalized.data[idx + 2] - reference.data[idx + 2]);

    deltas[0] += dr; deltas[1] += dg; deltas[2] += db;
    mse += (dr * dr + dg * dg + db * db) / 3;

    const lumA = 0.299 * normalized.data[idx] + 0.587 * normalized.data[idx + 1] + 0.114 * normalized.data[idx + 2];
    const lumB = 0.299 * reference.data[idx] + 0.587 * reference.data[idx + 1] + 0.114 * reference.data[idx + 2];
    lumDelta += Math.abs(lumA - lumB);
    n++;
  }

  const safeN = Math.max(n, 1);
  const avgMSE = mse / safeN;
  const psnr = avgMSE === 0 ? 99 : 20 * Math.log10(255 / Math.sqrt(avgMSE));

  const deltaAvg = (deltas[0] + deltas[1] + deltas[2]) / (3 * safeN);
  const ssimApprox = Math.max(0, Math.min(1, 1 - deltaAvg / 255));

  return {
    ssim: ssimApprox,
    psnr,
    deltaRGB: {
      R: deltas[0] / safeN,
      G: deltas[1] / safeN,
      B: deltas[2] / safeN,
    },
    deltaLuminance: lumDelta / safeN,
  };
}
