import assert from 'node:assert/strict';

export function frameStats(rgba, width = 1920, height = 1080, stride = 4) {
  const bins = new Map();
  let samples = 0;
  let alphaMinimum = 255;
  let sum = 0;
  let sumSquares = 0;
  let edges = 0;
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const offset = (y * width + x) * 4;
      const r = rgba[offset]; const g = rgba[offset + 1]; const b = rgba[offset + 2]; const a = rgba[offset + 3];
      alphaMinimum = Math.min(alphaMinimum, a);
      const luma = r * .2126 + g * .7152 + b * .0722;
      sum += luma;
      sumSquares += luma * luma;
      const bin = `${r >> 4}:${g >> 4}:${b >> 4}`;
      bins.set(bin, (bins.get(bin) ?? 0) + 1);
      if (x + stride < width) {
        const next = offset + stride * 4;
        if (Math.abs(r - rgba[next]) + Math.abs(g - rgba[next + 1]) + Math.abs(b - rgba[next + 2]) > 42) edges += 1;
      }
      samples += 1;
    }
  }
  const meanLuma = sum / samples;
  const lumaDeviation = Math.sqrt(Math.max(0, sumSquares / samples - meanLuma * meanLuma));
  const dominantRatio = Math.max(...bins.values()) / samples;
  const edgeRatio = edges / samples;
  return {
    alphaMinimum,
    meanLuma,
    lumaDeviation,
    colorBins: bins.size,
    dominantRatio,
    edgeRatio,
    blank: lumaDeviation < 7 || bins.size < 12 || dominantRatio > .995 || edgeRatio < .002,
  };
}

export function regionMeanLuma(rgba, { x, y, width, height }, frameWidth = 1920, stride = 4) {
  let sum = 0;
  let count = 0;
  for (let py = y; py < y + height; py += stride) for (let px = x; px < x + width; px += stride) {
    const offset = (py * frameWidth + px) * 4;
    sum += rgba[offset] * .2126 + rgba[offset + 1] * .7152 + rgba[offset + 2] * .0722;
    count += 1;
  }
  return sum / count;
}

export function psnr(a, b, byteStride = 16) {
  assert.equal(a.length, b.length, 'PSNR inputs must use the same dimensions');
  let squaredError = 0;
  let samples = 0;
  for (let i = 0; i < a.length; i += byteStride) {
    for (let channel = 0; channel < 3; channel += 1) {
      const delta = a[i + channel] - b[i + channel];
      squaredError += delta * delta;
      samples += 1;
    }
  }
  const mse = squaredError / samples;
  return mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse);
}
