export const TAU = Math.PI * 2;
export const SAMPLE_COUNT = 1024;
export const MAX_N = 256;

/** Equal arc-length sampling, so drawing speed does not bias the fit. */
export function resamplePath(points, count = SAMPLE_COUNT, closed = true) {
  const clean = points.filter((p, i) => Number.isFinite(p.x) && Number.isFinite(p.y) && (!i || Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) > 1e-8));
  if (clean.length < 2) throw new Error('請畫出一段有長度的線條。');
  const path = closed ? [...clean, clean[0]] : [...clean, ...clean.slice(0, -1).reverse()];
  const lengths = [0];
  for (let i = 1; i < path.length; i++) lengths.push(lengths[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
  const total = lengths.at(-1);
  if (total < 1e-6) throw new Error('線條太短了，請再畫大一點。');
  let segment = 1;
  return Array.from({ length: count }, (_, i) => {
    const distance = total * i / count;
    while (segment < lengths.length - 1 && lengths[segment] < distance) segment++;
    const weight = (distance - lengths[segment - 1]) / (lengths[segment] - lengths[segment - 1] || 1);
    return { x: path[segment - 1].x * (1 - weight) + path[segment].x * weight, y: path[segment - 1].y * (1 - weight) + path[segment].y * weight };
  });
}

export function normalizePath(points) {
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = Math.max(maxX - minX, maxY - minY) / 2;
  if (scale < 1e-8) throw new Error('線條太短了，請再畫大一點。');
  return points.map(p => ({ x: (p.x - (maxX + minX) / 2) / scale, y: (p.y - (maxY + minY) / 2) / scale }));
}

export function analyzePath(points, { closed = true, count = SAMPLE_COUNT, maxN = MAX_N } = {}) {
  const samples = resamplePath(normalizePath(points), count, closed);
  const limit = Math.min(maxN, Math.floor((count - 1) / 2));
  const cx = samples.reduce((s, p) => s + p.x, 0) / count;
  const cy = samples.reduce((s, p) => s + p.y, 0) / count;
  const totalEnergy = samples.reduce((s, p) => s + (p.x - cx) ** 2 + (p.y - cy) ** 2, 0) / count;
  const xs = samples.map(p => p.x), ys = samples.map(p => p.y);
  const diagonal = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const coefficients = [];
  const errors = [100 * Math.sqrt(totalEnergy) / diagonal];
  let residual = totalEnergy;
  for (let k = 1; k <= limit; k++) {
    let ax = 0, bx = 0, ay = 0, by = 0;
    for (let j = 0; j < count; j++) {
      const angle = TAU * k * j / count, cos = Math.cos(angle), sin = Math.sin(angle);
      ax += samples[j].x * cos; bx += samples[j].x * sin;
      ay += samples[j].y * cos; by += samples[j].y * sin;
    }
    ax *= 2 / count; bx *= 2 / count; ay *= 2 / count; by *= 2 / count;
    coefficients.push({ k, ax, bx, ay, by, rx: Math.hypot(ax, bx), ry: Math.hypot(ay, by), phaseX: Math.atan2(bx, ax), phaseY: Math.atan2(by, ay) });
    residual -= (ax * ax + bx * bx + ay * ay + by * by) / 2;
    errors.push(100 * Math.sqrt(Math.max(0, residual)) / diagonal);
  }
  return { samples, coefficients, cx, cy, diagonal, errors, maxN: limit, closed };
}

export function evaluate(model, n, t) {
  let x = model.cx, y = model.cy;
  for (let i = 0; i < Math.min(n, model.maxN); i++) {
    const c = model.coefficients[i], cos = Math.cos(c.k * t), sin = Math.sin(c.k * t);
    x += c.ax * cos + c.bx * sin; y += c.ay * cos + c.by * sin;
  }
  return { x, y };
}

export function reconstruct(model, n, count = SAMPLE_COUNT) {
  return Array.from({ length: count + 1 }, (_, i) => evaluate(model, n, TAU * i / count));
}

export function examplePath(kind) {
  if (kind === 'star') return Array.from({ length: 10 }, (_, i) => {
    const t = Math.PI / 2 + i * TAU / 10, r = i % 2 ? 0.43 : 1;
    return { x: r * Math.cos(t), y: r * Math.sin(t) };
  });
  return Array.from({ length: 600 }, (_, i) => {
    const t = i * TAU / 600;
    if (kind === 'heart') return { x: 16 * Math.sin(t) ** 3, y: 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t) };
    if (kind === 'circle') return { x: Math.cos(t), y: Math.sin(t) };
    const r = 0.72 + 0.28 * Math.cos(5 * t);
    return { x: r * Math.sin(t), y: r * Math.cos(t) };
  });
}

export function formulaText(model, n) {
  const number = x => (Math.abs(x) < 5e-10 ? 0 : x).toFixed(8).replace(/\.?0+$/, '') || '0';
  const expression = axis => {
    let result = number(axis === 'x' ? model.cx : model.cy);
    for (const c of model.coefficients.slice(0, n)) {
      for (const [fn, value] of [['cos', c['a' + axis]], ['sin', c['b' + axis]]]) {
        if (Math.abs(value) >= 5e-10) result += ` ${value >= 0 ? '+' : '-'} ${number(Math.abs(value))}*${fn}(${c.k}*t)`;
      }
    }
    return `${axis}(t) = ${result}`;
  };
  return `N = ${n}\nt ∈ [0, 2π]\n座標：等比例縮放，外框最長邊為 2；Y 軸向上。\n${expression('x')}\n${expression('y')}\nNRMSE = ${model.errors[n].toFixed(6)}%`;
}
