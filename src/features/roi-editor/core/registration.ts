import type { RegistrationConfig, RegistrationResult } from '../types/pipeline';

export function registerByTranslation(source: ImageData, reference: ImageData, cfg: RegistrationConfig): RegistrationResult {
  const maxShift = cfg.maxShiftPx;
  let best = { shiftX: 0, shiftY: 0, score: -Infinity };

  for (let sy = -maxShift; sy <= maxShift; sy += 2) {
    for (let sx = -maxShift; sx <= maxShift; sx += 2) {
      const score = correlationScore(source, reference, sx, sy, cfg.sampleStep);
      if (score > best.score) best = { shiftX: sx, shiftY: sy, score };
    }
  }

  const inlierRatio = Math.max(0, Math.min(1, (best.score + 1) / 2));
  return { shiftX: best.shiftX, shiftY: best.shiftY, inlierRatio };
}

function correlationScore(a: ImageData, b: ImageData, shiftX: number, shiftY: number, step: number): number {
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  let sum = 0;
  let n = 0;

  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const bx = x + shiftX;
      const by = y + shiftY;
      if (bx < 0 || by < 0 || bx >= w || by >= h) continue;
      const ia = (y * a.width + x) * 4;
      const ib = (by * b.width + bx) * 4;
      const la = 0.299 * a.data[ia] + 0.587 * a.data[ia + 1] + 0.114 * a.data[ia + 2];
      const lb = 0.299 * b.data[ib] + 0.587 * b.data[ib + 1] + 0.114 * b.data[ib + 2];
      sum += 1 - Math.abs(la - lb) / 255;
      n++;
    }
  }

  return n ? (sum / n) * 2 - 1 : -1;
}
