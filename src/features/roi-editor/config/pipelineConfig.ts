import type { PipelineConfig } from '../types/pipeline';

export const defaultPipelineConfig: PipelineConfig = {
  isolation: {
    method: 'threshold',
    threshold: 95,
    blurRadius: 1,
  },
  registration: {
    maxShiftPx: 20,
    sampleStep: 6,
  },
  quality: {
    minInlierRatio: 0.7,
    maxDeltaRGB: 15,
    minSSIM: 0.85,
    minPSNR: 25,
  },
};
