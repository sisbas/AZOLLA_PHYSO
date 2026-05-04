export function getImageDataFromElement(img: HTMLImageElement): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context alınamadı.');
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export function meanRGB(image: ImageData, mask?: Uint8Array): [number, number, number] {
  const { data, width, height } = image;
  let r = 0, g = 0, b = 0, count = 0;
  for (let i = 0; i < width * height; i++) {
    if (mask && mask[i] === 0) continue;
    const idx = i * 4;
    r += data[idx]; g += data[idx + 1]; b += data[idx + 2];
    count++;
  }
  if (count === 0) return [0, 0, 0];
  return [r / count, g / count, b / count];
}
