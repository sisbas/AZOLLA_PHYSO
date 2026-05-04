import type { ROIIsolationConfig } from '../types/pipeline';

export function isolateROI(image: ImageData, cfg: ROIIsolationConfig): Uint8Array {
  const { data, width, height } = image;
  const mask = new Uint8Array(width * height);

  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    let keep = 0;

    if (cfg.method === 'threshold') {
      keep = gray >= cfg.threshold ? 1 : 0;
    } else if (cfg.fixedRect) {
      const x = i % width;
      const y = Math.floor(i / width);
      const { x: rx, y: ry, width: rw, height: rh } = cfg.fixedRect;
      keep = x >= rx && x < rx + rw && y >= ry && y < ry + rh ? 1 : 0;
    }

    mask[i] = keep;
  }

  return cfg.blurRadius > 0 ? smoothMask(mask, width, height) : mask;
}

function smoothMask(mask: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          sum += mask[(y + dy) * width + (x + dx)];
        }
      }
      out[y * width + x] = sum >= 5 ? 1 : 0;
    }
  }
  return out;
}
