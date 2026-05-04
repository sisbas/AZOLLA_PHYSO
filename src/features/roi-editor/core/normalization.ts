// ROI Editor Normalization Module - Backend roi_editor/normalization.py ile uyumlu
import type { NormalizationParams, NormalizationStats } from '../types/pipeline';

/**
 * Görüntüyü referans görüntüye göre normalizer (histogram matching).
 * Backend'deki normalize_to_reference fonksiyonu ile aynı mantık.
 */
export function normalizeToReference(
  image: ImageData,
  reference: ImageData,
  mask?: Uint8Array,
  params?: Partial<NormalizationParams>
): { matched: ImageData; stats: NormalizationStats } {
  const defaultParams: NormalizationParams = {
    channels: params?.channels || [0, 1, 2], // R, G, B
    use_roi_only: params?.use_roi_only ?? true,
    clip_values: params?.clip_values ?? true,
    min_value: params?.min_value ?? 0,
    max_value: params?.max_value ?? 255
  };

  const channels = defaultParams.channels;

  // Maske bölgesinde istatistik hesapla
  const imgChannels = extractChannels(image, mask, channels, defaultParams.use_roi_only);
  const refChannels = extractChannels(reference, mask, channels, defaultParams.use_roi_only);

  // Histogram matching (basitleştirilmiş - moment matching)
  const matched = histogramMatching(image, imgChannels, refChannels, channels);

  // Değerleri kırp (0-255 aralığı)
  if (defaultParams.clip_values) {
    clipImageData(matched, defaultParams.min_value, defaultParams.max_value);
  }

  // İstatistikleri hesapla
  const stats = computeNormalizationStats(imgChannels, refChannels, matched, mask, channels);

  return { matched, stats };
}

/**
 * Kanalları maske bölgesinden çıkarır
 */
function extractChannels(
  image: ImageData,
  mask: Uint8Array | undefined,
  channels: number[],
  useRoiOnly: boolean
): Float64Array[] {
  const { data, width, height } = image;
  const result: Float64Array[] = [];

  for (const c of channels) {
    const values: number[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        // Maske kontrolü
        if (useRoiOnly && mask && mask[i] === 0) continue;

        const idx = i * 4 + c;
        values.push(data[idx]);
      }
    }
    result.push(new Float64Array(values));
  }

  return result;
}

/**
 * Histogram matching - moment matching yaklaşımı
 */
function histogramMatching(
  image: ImageData,
  imgChannels: Float64Array[],
  refChannels: Float64Array[],
  channels: number[]
): ImageData {
  const { width, height, data } = image;
  const matched = new ImageData(width, height);

  // Her kanal için kazanç ve offset hesapla
  const gains: number[] = [];
  const offsets: number[] = [];

  for (let i = 0; i < channels.length; i++) {
    const imgMean = mean(imgChannels[i]);
    const imgStd = std(imgChannels[i], imgMean);
    const refMean = mean(refChannels[i]);
    const refStd = std(refChannels[i], refMean);

    // Kazanç ve offset
    gains.push(imgStd === 0 ? 1 : refStd / imgStd);
    offsets.push(refMean - imgMean * gains[i]);
  }

  // Uygula
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    for (let c = 0; c < 3; c++) {
      const channelIdx = channels.indexOf(c);
      if (channelIdx >= 0) {
        matched.data[idx + c] = data[idx + c] * gains[channelIdx] + offsets[channelIdx];
      } else {
        matched.data[idx + c] = data[idx + c];
      }
    }
    matched.data[idx + 3] = 255;
  }

  return matched;
}

/**
 * Normalizasyon istatistiklerini hesaplar
 */
function computeNormalizationStats(
  imgChannels: Float64Array[],
  refChannels: Float64Array[],
  matched: ImageData,
  mask: Uint8Array | undefined,
  channels: number[]
): NormalizationStats {
  const channelNames = ['R', 'G', 'B'];
  const stats: any = {};

  let totalShift = 0.0;

  for (let i = 0; i < channels.length; i++) {
    const c = channels[i];
    const name = channelNames[c] || `C${c}`;

    // Kaynak istatistikleri
    const sourceMean = mean(imgChannels[i]);
    const sourceStd = std(imgChannels[i], sourceMean);

    // Referans istatistikleri
    const referenceMean = mean(refChannels[i]);
    const referenceStd = std(refChannels[i], referenceMean);

    // Eşleştirilmiş istatistikleri
    const matchedChannel = extractSingleChannel(matched, mask, c);
    const matchedMean = mean(matchedChannel);

    // Ortalama kayma
    const shift = Math.abs(matchedMean - referenceMean);
    totalShift += shift;

    stats[`${name}_mean_source`] = sourceMean;
    stats[`${name}_mean_reference`] = referenceMean;
    stats[`${name}_mean_matched`] = matchedMean;
    stats[`${name}_std_source`] = sourceStd;
    stats[`${name}_std_reference`] = referenceStd;
  }

  stats['overall_mean_shift'] = totalShift / channels.length;
  stats['channels'] = channels;

  return stats as NormalizationStats;
}

/**
 * Tek bir kanalı çıkarır
 */
function extractSingleChannel(
  image: ImageData,
  mask: Uint8Array | undefined,
  channel: number
): Float64Array {
  const { data, width, height } = image;
  const values: number[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (mask && mask[i] === 0) continue;

      const idx = i * 4 + channel;
      values.push(data[idx]);
    }
  }

  return new Float64Array(values);
}

/**
 * Ortalama hesaplama
 */
function mean(arr: Float64Array): number {
  if (arr.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i];
  }
  return sum / arr.length;
}

/**
 * Standart sapma hesaplama
 */
function std(arr: Float64Array, meanVal: number): number {
  if (arr.length <= 1) return 0;
  let sumSq = 0;
  for (let i = 0; i < arr.length; i++) {
    const diff = arr[i] - meanVal;
    sumSq += diff * diff;
  }
  return Math.sqrt(sumSq / arr.length);
}

/**
 * Görüntü değerlerini kırp
 */
function clipImageData(
  image: ImageData,
  minVal: number,
  maxVal: number
): void {
  const { data } = image;
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.max(minVal, Math.min(maxVal, Math.round(data[i])));
  }
}

/**
 * İki görüntü arasındaki renk farkını hesaplar
 */
export function computeColorDifference(
  image1: ImageData,
  image2: ImageData,
  mask?: Uint8Array
): { delta_rgb: { R: number; G: number; B: number }; delta_luminance: number; total_delta: number } {
  const { width, height } = image1;
  const deltas = [0, 0, 0];
  let lumDelta = 0;
  let n = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (mask && mask[i] === 0) continue;

      const idx = i * 4;
      deltas[0] += Math.abs(image1.data[idx] - image2.data[idx]);
      deltas[1] += Math.abs(image1.data[idx + 1] - image2.data[idx + 1]);
      deltas[2] += Math.abs(image1.data[idx + 2] - image2.data[idx + 2]);

      const lum1 = 0.299 * image1.data[idx] + 0.587 * image1.data[idx + 1] + 0.114 * image1.data[idx + 2];
      const lum2 = 0.299 * image2.data[idx] + 0.587 * image2.data[idx + 1] + 0.114 * image2.data[idx + 2];
      lumDelta += Math.abs(lum1 - lum2);

      n++;
    }
  }

  const safeN = Math.max(n, 1);
  return {
    delta_rgb: {
      R: deltas[0] / safeN,
      G: deltas[1] / safeN,
      B: deltas[2] / safeN
    },
    delta_luminance: lumDelta / safeN,
    total_delta: (deltas[0] + deltas[1] + deltas[2]) / (3 * safeN)
  };
}

/**
 * Normalizasyon kalitesini doğrular
 */
export function validateNormalizationQuality(
  stats: NormalizationStats,
  maxAllowedShift: number = 15.0
): { success: boolean; message: string } {
  if (stats.overall_mean_shift <= maxAllowedShift) {
    return {
      success: true,
      message: `Normalizasyon başarılı (kayma: ${stats.overall_mean_shift.toFixed(2)})`
    };
  } else {
    return {
      success: false,
      message: `Aşırı renk kayması (${stats.overall_mean_shift.toFixed(2)} > ${maxAllowedShift})`
    };
  }
}
