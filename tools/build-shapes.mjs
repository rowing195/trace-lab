// Generates dist/shapes.js: detailed built-in examples for the drawing panel.
// Silhouettes are signed-distance compositions (original artwork) traced with the app's own
// marching squares. The Taiwan outline is the main island of Natural Earth 1:10m Admin 0 Countries
// (public domain, naturalearthdata.com), simplified to ~400 m.
// Usage: node tools/build-shapes.mjs   (also prints the 24×24 icon paths used in index.html)
import { writeFileSync } from 'node:fs';
import { marchingSquares, simplify, polygonArea } from '../dist/edge.js';
import { normalizePath } from '../dist/fourier.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const circle = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r;
const ellipse = (cx, cy, rx, ry, degrees = 0) => {
  const c = Math.cos(degrees * Math.PI / 180), s = Math.sin(degrees * Math.PI / 180);
  return (x, y) => {
    const u = (x - cx) * c + (y - cy) * s, v = -(x - cx) * s + (y - cy) * c;
    const k0 = Math.hypot(u / rx, v / ry), k1 = Math.hypot(u / (rx * rx), v / (ry * ry));
    return k1 ? k0 * (k0 - 1) / k1 : -Math.min(rx, ry);
  };
};
const capsule = (points, r) => (x, y) => {
  let d = Infinity;
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1], [bx, by] = points[i], dx = bx - ax, dy = by - ay;
    const h = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0, 1);
    d = Math.min(d, Math.hypot(x - ax - dx * h, y - ay - dy * h) - r);
  }
  return d;
};
const polygon = points => (x, y) => {
  let d = Infinity, sign = 1;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [px, py] = points[i], ex = points[j][0] - px, ey = points[j][1] - py, wx = x - px, wy = y - py;
    const h = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey), 0, 1);
    d = Math.min(d, Math.hypot(wx - ex * h, wy - ey * h));
    const a = y >= py, b = y < points[j][1], c = ex * wy > ey * wx;
    if ((a && b && c) || (!a && !b && !c)) sign = -sign;
  }
  return sign * d;
};
const bezier = (a, b, c, d, steps = 24) => Array.from({ length: steps + 1 }, (_, i) => {
  const t = i / steps, u = 1 - t;
  return [0, 1].map(k => u ** 3 * a[k] + 3 * u * u * t * b[k] + 3 * u * t * t * c[k] + t ** 3 * d[k]);
});
/** Smooth union with blend radius k (0 = hard union). */
const union = (k, ...parts) => (x, y) => parts.reduce((a, part) => {
  const b = part(x, y), h = k ? Math.max(k - Math.abs(a - b), 0) / k : 0;
  return Math.min(a, b) - h * h * k / 4;
}, Infinity);

// Original silhouettes, drawn in a 400 × 400 box with y pointing down.
const silhouettes = {
  cat: union(8,
    union(20, ellipse(200, 288, 96, 96), ellipse(200, 152, 68, 58)),
    polygon([[144, 134], [148, 56], [194, 104]]), polygon([[256, 134], [252, 56], [206, 104]]),
    ellipse(164, 378, 32, 14), ellipse(236, 378, 32, 14),
    capsule(bezier([272, 356], [372, 356], [384, 268], [334, 228]), 12)),
  rabbit: union(12,
    union(26, ellipse(228, 280, 104, 86), ellipse(132, 196, 62, 50, -14)),
    ellipse(112, 104, 21, 66, -14), ellipse(152, 108, 19, 62, 12),
    circle(328, 262, 25), ellipse(146, 356, 38, 14), ellipse(256, 362, 64, 15)),
  butterfly: union(5,
    ellipse(128, 150, 96, 64, 32), ellipse(272, 150, 96, 64, -32),
    ellipse(158, 268, 52, 72, 27), ellipse(242, 268, 52, 72, -27),
    capsule([[200, 126], [200, 322]], 10), circle(200, 112, 15),
    capsule(bezier([194, 100], [184, 70], [168, 46], [150, 34]), 3.5), circle(148, 32, 8),
    capsule(bezier([206, 100], [216, 70], [232, 46], [250, 34]), 3.5), circle(252, 32, 8)),
  note: union(4,
    ellipse(122, 318, 50, 34, -24), ellipse(292, 288, 50, 34, -24),
    capsule([[164, 304], [164, 100]], 7), capsule([[334, 274], [334, 70]], 7),
    polygon([[157, 88], [341, 58], [341, 110], [157, 140]])),
};

// [lon, lat], Natural Earth 1:10m, main island of Taiwan, Douglas–Peucker 0.004° (in projected units).
const TAIWAN = [[121.9058,24.9501],[121.8235,24.8549],[121.8068,24.7788],[121.8203,24.6997],[121.815,24.6444],[121.828,24.6228],[121.8527,24.6089],[121.8818,24.604],[121.8818,24.5978],[121.8578,24.5978],[121.8408,24.5903],[121.856,24.5505],[121.8528,24.531],[121.8301,24.5192],[121.84,24.4813],[121.8068,24.4606],[121.78,24.4327],[121.7808,24.3976],[121.7586,24.3323],[121.7727,24.3092],[121.7039,24.2383],[121.6978,24.219],[121.6629,24.1931],[121.6413,24.1299],[121.6074,24.0769],[121.6082,24.0605],[121.6289,24.0262],[121.6292,24.015],[121.6111,23.9825],[121.5945,23.8915],[121.5703,23.8321],[121.5398,23.6928],[121.5215,23.6587],[121.4622,23.343],[121.4268,23.2931],[121.4089,23.2546],[121.4001,23.1455],[121.3816,23.1107],[121.3474,23.0833],[121.3189,23.0255],[121.2996,22.9592],[121.2556,22.8978],[121.1903,22.8432],[121.1903,22.8022],[121.1774,22.7786],[121.1414,22.7418],[121.0803,22.7041],[121.0291,22.6575],[120.9912,22.5831],[120.9483,22.5268],[120.9229,22.4247],[120.8866,22.366],[120.8814,22.3459],[120.875,22.2893],[120.8792,22.0558],[120.8636,22.0089],[120.8357,21.9872],[120.8403,21.9046],[120.8231,21.9286],[120.7674,21.9593],[120.7373,21.9661],[120.7361,21.9428],[120.7273,21.9345],[120.7004,21.9484],[120.7044,21.9814],[120.6817,22.0225],[120.6834,22.079],[120.697,22.1132],[120.6213,22.2951],[120.5697,22.3738],[120.5181,22.407],[120.512,22.4247],[120.4572,22.4516],[120.4133,22.4823],[120.3809,22.4839],[120.3312,22.5197],[120.2852,22.5801],[120.3337,22.5259],[120.328,22.5517],[120.3135,22.5771],[120.2458,22.6425],[120.2396,22.6591],[120.2521,22.6896],[120.2463,22.7099],[120.2,22.7925],[120.1965,22.8186],[120.2035,22.8397],[120.1755,22.8841],[120.1638,22.9538],[120.1421,22.9803],[120.1602,22.9921],[120.1703,23.0134],[120.1662,23.0317],[120.1421,23.0349],[120.1267,23.0071],[120.1141,23.0076],[120.1079,23.0486],[120.0925,23.0548],[120.0767,23.0374],[120.0663,23.0349],[120.0552,23.0437],[120.0594,23.0759],[120.0964,23.0864],[120.1004,23.097],[120.0594,23.1107],[120.0594,23.1175],[120.0892,23.1177],[120.0594,23.151],[120.062,23.165],[120.0819,23.1732],[120.0869,23.182],[120.0786,23.207],[120.0961,23.2395],[120.1089,23.2867],[120.1247,23.295],[120.1105,23.3037],[120.1165,23.3179],[120.1489,23.3223],[120.1458,23.3333],[120.1373,23.3277],[120.1209,23.3297],[120.1208,23.3413],[120.1301,23.361],[120.1646,23.3617],[120.1348,23.4263],[120.1421,23.4458],[120.1305,23.451],[120.1575,23.4915],[120.125,23.4896],[120.1243,23.52],[120.1417,23.5379],[120.1436,23.638],[120.1708,23.6989],[120.1844,23.7644],[120.2195,23.8179],[120.2407,23.8328],[120.2575,23.8784],[120.2922,23.9119],[120.3504,24.0381],[120.3855,24.0631],[120.3923,24.0829],[120.4119,24.0969],[120.422,24.1522],[120.4932,24.2307],[120.512,24.2956],[120.5474,24.3515],[120.5581,24.3859],[120.6489,24.4839],[120.6594,24.5207],[120.7022,24.607],[120.7279,24.6139],[120.7446,24.6388],[120.7781,24.6657],[120.7993,24.6708],[120.8267,24.6661],[120.823,24.685],[120.8475,24.7108],[120.8577,24.737],[120.8713,24.7432],[120.9092,24.8169],[120.9024,24.8368],[120.9206,24.8614],[120.926,24.8847],[120.9536,24.905],[120.9639,24.9404],[121.0055,25.0007],[121.0593,25.0502],[121.1294,25.0711],[121.1769,25.1],[121.2109,25.1112],[121.3303,25.1307],[121.3788,25.1579],[121.4123,25.1555],[121.43,25.1316],[121.4432,25.1364],[121.4295,25.156],[121.3958,25.1828],[121.3991,25.1921],[121.4163,25.2036],[121.4363,25.2414],[121.4613,25.2619],[121.4978,25.2788],[121.5397,25.2874],[121.5808,25.283],[121.5979,25.2714],[121.6497,25.1971],[121.6844,25.2005],[121.6764,25.1794],[121.7039,25.1569],[121.9051,25.1066],[121.8972,25.0839],[121.8999,25.066],[121.9192,25.022],[121.9675,25.0211],[121.9977,25.0107],[122.0054,25.0019],[121.9268,24.9666]];

function trace(sdf) {
  const pad = 20, size = 400 + 2 * pad, field = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) field[y * size + x] = -sdf(x - pad, y - pad);
  const outline = marchingSquares(field, size, size, 0).reduce((a, b) => polygonArea(b) > polygonArea(a) ? b : a);
  return simplify(outline, 0.25).map(p => ({ x: p.x - pad, y: -(p.y - pad) }));
}

const latitude = Math.cos(23.6 * Math.PI / 180);
const shapes = {
  ...Object.fromEntries(Object.entries(silhouettes).map(([name, sdf]) => [name, trace(sdf)])),
  taiwan: TAIWAN.map(([lon, lat]) => ({ x: lon * latitude, y: lat })),
};

const round = v => Math.round(v * 1000) / 1000 || 0;
const data = Object.entries(shapes).map(([name, points]) => `  ${name}: [${normalizePath(points).flatMap(p => [round(p.x), round(p.y)]).join(',')}],`).join('\n');
writeFileSync(new URL('../dist/shapes.js', import.meta.url), `// Generated by tools/build-shapes.mjs. Do not edit by hand.
// Silhouettes are original artwork; Taiwan: Natural Earth 1:10m (public domain).
// Flat [x0, y0, x1, y1, …] lists, normalized so the longest side is 2 and y points up.
export const SHAPES = {
${data}
};

export function shapePath(name) {
  const flat = SHAPES[name], points = [];
  for (let i = 0; i < flat.length; i += 2) points.push({ x: flat[i], y: flat[i + 1] });
  return points;
}
`);

for (const [name, points] of Object.entries(shapes)) {
  const icon = simplify(normalizePath(points), 0.05).map(p => `${(12 + p.x * 9.5).toFixed(1)} ${(12 - p.y * 9.5).toFixed(1)}`);
  console.log(`${name}: <path d="M${icon.join('L')}Z"/>`);
}
