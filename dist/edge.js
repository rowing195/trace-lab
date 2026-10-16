/**
 * Image → one ordered path for the Fourier fitter. Everything runs locally; no dependencies.
 * Pipeline: luminance (or alpha) → Gaussian blur → Otsu threshold → marching squares (sub-pixel
 * contours) → largest outline, or every contour chained into one stroke → Douglas–Peucker.
 */

export const IMAGE_MAX_SIDE = 480;

/** Otsu threshold for values in [0, 1]. */
export function otsu(values) {
  const bins = new Float64Array(256);
  for (const v of values) bins[Math.min(255, Math.max(0, Math.round(v * 255)))]++;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * bins[i];
  let below = 0, sumBelow = 0, best = -1, threshold = 127;
  for (let i = 0; i < 255; i++) {
    below += bins[i]; sumBelow += i * bins[i];
    const above = values.length - below;
    if (!below || !above) continue;
    const between = below * above * (sumBelow / below - (sumAll - sumBelow) / above) ** 2;
    if (between > best) { best = between; threshold = i; }
  }
  return (threshold + 0.5) / 255;
}

function blur(source, width, height, sigma) {
  if (!(sigma > 0)) return source;
  const radius = Math.ceil(sigma * 2.5), kernel = [];
  let sum = 0;
  for (let i = -radius; i <= radius; i++) { const v = Math.exp(-i * i / (2 * sigma * sigma)); kernel.push(v); sum += v; }
  kernel.forEach((v, i) => { kernel[i] = v / sum; });
  const pass = (input, horizontal) => {
    const output = new Float32Array(input.length);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      let v = 0;
      for (let i = -radius; i <= radius; i++) {
        const sx = horizontal ? Math.min(width - 1, Math.max(0, x + i)) : x, sy = horizontal ? y : Math.min(height - 1, Math.max(0, y + i));
        v += input[sy * width + sx] * kernel[i + radius];
      }
      output[y * width + x] = v;
    }
    return output;
  };
  return pass(pass(source, true), false);
}

/**
 * Marching squares on a scalar field (row-major, `width` × `height`). Returns closed polylines
 * where the field crosses `iso`, in field coordinates. The caller pads the field with background
 * so that every contour closes.
 */
export function marchingSquares(field, width, height, iso) {
  const position = new Map(), links = new Map();
  const at = (x, y) => field[y * width + x];
  const horizontal = (x, y) => {
    const key = (y * width + x) * 2;
    if (!position.has(key)) { const a = at(x, y), b = at(x + 1, y); position.set(key, { x: x + (iso - a) / (b - a), y }); }
    return key;
  };
  const vertical = (x, y) => {
    const key = (y * width + x) * 2 + 1;
    if (!position.has(key)) { const a = at(x, y), b = at(x, y + 1); position.set(key, { x, y: y + (iso - a) / (b - a) }); }
    return key;
  };
  const link = (a, b) => {
    if (!links.has(a)) links.set(a, []);
    if (!links.has(b)) links.set(b, []);
    links.get(a).push(b); links.get(b).push(a);
  };
  for (let y = 0; y < height - 1; y++) for (let x = 0; x < width - 1; x++) {
    const tl = at(x, y), tr = at(x + 1, y), br = at(x + 1, y + 1), bl = at(x, y + 1);
    const index = (tl > iso) << 3 | (tr > iso) << 2 | (br > iso) << 1 | (bl > iso);
    if (index === 0 || index === 15) continue;
    const top = () => horizontal(x, y), right = () => vertical(x + 1, y), bottom = () => horizontal(x, y + 1), left = () => vertical(x, y);
    const centre = (tl + tr + br + bl) / 4 > iso;
    switch (index) {
      case 1: case 14: link(left(), bottom()); break;
      case 2: case 13: link(bottom(), right()); break;
      case 3: case 12: link(left(), right()); break;
      case 4: case 11: link(top(), right()); break;
      case 6: case 9: link(top(), bottom()); break;
      case 7: case 8: link(left(), top()); break;
      case 5: if (centre) { link(left(), top()); link(bottom(), right()); } else { link(top(), right()); link(left(), bottom()); } break;
      case 10: if (centre) { link(top(), right()); link(left(), bottom()); } else { link(left(), top()); link(bottom(), right()); } break;
    }
  }
  const visited = new Set(), contours = [];
  for (const start of links.keys()) {
    if (visited.has(start)) continue;
    const loop = [];
    let previous = -1, current = start;
    while (current !== undefined && !visited.has(current)) {
      visited.add(current); loop.push(position.get(current));
      const next = links.get(current).find(n => n !== previous && !visited.has(n));
      previous = current; current = next;
    }
    if (loop.length > 2) contours.push(loop);
  }
  return contours;
}

/** Ramer–Douglas–Peucker simplification of an open polyline. */
export function simplify(points, epsilon) {
  if (points.length < 3) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(), A = points[a], B = points[b], dx = B.x - A.x, dy = B.y - A.y, length = Math.hypot(dx, dy);
    let worst = -1, index = -1;
    for (let i = a + 1; i < b; i++) {
      const d = length ? Math.abs(dy * (points[i].x - A.x) - dx * (points[i].y - A.y)) / length : Math.hypot(points[i].x - A.x, points[i].y - A.y);
      if (d > worst) { worst = d; index = i; }
    }
    if (worst > epsilon) { keep[index] = 1; stack.push([a, index], [index, b]); }
  }
  return points.filter((_, i) => keep[i]);
}

export const polygonArea = loop => Math.abs(loop.reduce((sum, p, i) => { const q = loop[(i + 1) % loop.length]; return sum + p.x * q.y - q.x * p.y; }, 0) / 2);
const perimeter = loop => loop.reduce((sum, p, i) => { const q = loop[(i + 1) % loop.length]; return sum + Math.hypot(q.x - p.x, q.y - p.y); }, 0);

/** Greedy nearest-neighbour chaining; each loop starts where the pen arrives and returns there. */
function chainContours(contours) {
  const remaining = [...contours].sort((a, b) => polygonArea(b) - polygonArea(a));
  const first = remaining.shift(), result = [...first, first[0]];
  while (remaining.length) {
    const end = result.at(-1);
    let bestLoop = 0, bestPoint = 0, bestDistance = Infinity;
    remaining.forEach((loop, li) => loop.forEach((p, pi) => {
      const d = (p.x - end.x) ** 2 + (p.y - end.y) ** 2;
      if (d < bestDistance) { bestDistance = d; bestLoop = li; bestPoint = pi; }
    }));
    const loop = remaining.splice(bestLoop, 1)[0];
    result.push(...loop.slice(bestPoint), ...loop.slice(0, bestPoint + 1));
  }
  return result;
}

/**
 * Pre-computes the blurred brightness field of an RGBA image ({ data, width, height }, e.g. ImageData)
 * so that threshold changes only re-run the contour step. Transparent backgrounds use alpha instead.
 */
export function prepareImage({ data, width, height }, { sigma = 1.2 } = {}) {
  if (!(width > 1 && height > 1)) throw new Error('圖片太小了，請換一張較大的圖片。');
  const pixels = width * height, alpha = new Float32Array(pixels), luminance = new Float32Array(pixels);
  for (let i = 0; i < pixels; i++) {
    const a = data[i * 4 + 3] / 255;
    alpha[i] = a;
    luminance[i] = (0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]) / 255 * a + (1 - a);
  }
  const borderMean = values => {
    let sum = 0;
    for (let x = 0; x < width; x++) sum += values[x] + values[(height - 1) * width + x];
    for (let y = 1; y < height - 1; y++) sum += values[y * width] + values[y * width + width - 1];
    return sum / (2 * width + 2 * (height - 2));
  };
  // A transparent border means a cut-out (sticker, logo): opacity is the cleanest subject mask.
  const useAlpha = borderMean(alpha) < 0.5 && alpha.some(a => a > 0.5);
  const source = useAlpha ? alpha.map(a => 1 - a) : luminance;
  const brightness = blur(source, width, height, sigma);
  return { brightness, width, height, threshold: otsu(brightness), darkSubject: borderMean(brightness) > 0.5, usesAlpha: useAlpha };
}

/**
 * Traces a prepared image. mode 'outline' keeps the outer boundary of the largest shape; 'all'
 * chains every significant contour into one stroke (with straight jumps between them).
 * Returns points in image pixels with the y axis pointing up.
 */
export function traceImage(prepared, { threshold = prepared.threshold, invert = false, mode = 'outline', maxContours = 60 } = {}) {
  const { brightness, width, height } = prepared, dark = prepared.darkSubject !== invert;
  const paddedWidth = width + 2, field = new Float32Array(paddedWidth * (height + 2));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const v = brightness[y * width + x];
    field[(y + 1) * paddedWidth + x + 1] = dark ? 1 - v : v;
  }
  const iso = Math.min(0.995, Math.max(0.005, dark ? 1 - threshold : threshold));
  let contours = marchingSquares(field, paddedWidth, height + 2, iso).filter(loop => polygonArea(loop) > 4);
  if (!contours.length) throw new Error('找不到明顯的輪廓。試著調整門檻，或換一張主體與背景對比較高的圖片。');
  const lengths = new Map(contours.map(loop => [loop, perimeter(loop)])), longest = Math.max(...lengths.values());
  contours = contours.filter(loop => lengths.get(loop) >= longest * 0.02).sort((a, b) => lengths.get(b) - lengths.get(a)).slice(0, maxContours);
  const path = mode === 'all' ? chainContours(contours) : contours.reduce((a, b) => polygonArea(b) > polygonArea(a) ? b : a);
  // Field coordinates are padded by one pixel and sit on pixel centres.
  return { points: simplify(path, 0.3).map(p => ({ x: p.x - 0.5, y: 0.5 - p.y })), contourCount: contours.length };
}

/** Browser only: decodes an image file and downsamples it onto a canvas. */
export async function loadImage(file, maxSide = IMAGE_MAX_SIDE) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try { await image.decode(); } catch { throw new Error('無法讀取這張圖片，請改用 PNG、JPG 或 WebP。'); }
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('無法判斷這張圖片的尺寸，請改用 PNG、JPG 或 WebP。');
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(2, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(2, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { canvas, imageData: ctx.getImageData(0, 0, canvas.width, canvas.height) };
  } finally { URL.revokeObjectURL(url); }
}
