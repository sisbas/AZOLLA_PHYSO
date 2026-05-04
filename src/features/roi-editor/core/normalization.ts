import { meanRGB } from './imageData';
import type { NormalizationStats } from '../types/pipeline';

export function normalizeToReference(source: ImageData, reference: ImageData, mask?: Uint8Array): { normalized: ImageData; stats: NormalizationStats } {
  const srcMean = meanRGB(source, mask);
  const refMean = meanRGB(reference, mask);
  const gain: [number, number, number] = [0, 1, 2].map((i) => (srcMean[i] === 0 ? 1 : refMean[i] / srcMean[i])) as [number, number, number];

  const normalized = new ImageData(source.width, source.height);
  for (let i = 0; i < source.width * source.height; i++) {
    const idx = i * 4;
    normalized.data[idx] = clamp(source.data[idx] * gain[0]);
    normalized.data[idx + 1] = clamp(source.data[idx + 1] * gain[1]);
    normalized.data[idx + 2] = clamp(source.data[idx + 2] * gain[2]);
    normalized.data[idx + 3] = 255;
  }

  const normMean = meanRGB(normalized, mask);
  return {
    normalized,
    stats: { sourceMean: srcMean, referenceMean: refMean, normalizedMean: normMean },
  };
}

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
