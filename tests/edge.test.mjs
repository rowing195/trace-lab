import test from 'node:test';
import assert from 'node:assert/strict';
import { otsu, marchingSquares, simplify, prepareImage, traceImage, polygonArea } from '../dist/edge.js';
import { analyzePath, smoothPath, pathBounds } from '../dist/fourier.js';
import { SHAPES, shapePath } from '../dist/shapes.js';

/** RGBA image whose pixel centres are coloured by paint(x, y) → [r, g, b, a]. */
function image(width, height, paint) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(paint(x + .5, y + .5), (y * width + x) * 4);
  return { data, width, height };
}
const disk = (cx, cy, r, inside, outside) => (x, y) => Math.hypot(x - cx, y - cy) < r ? inside : outside;
const BLACK = [20, 20, 20, 255], WHITE = [250, 250, 250, 255];

test('Otsu separates two brightness groups', () => {
  const t = otsu([...Array(50).fill(.1), ...Array(50).fill(.9)]);
  assert.ok(t > .1 && t < .9);
});

test('marching squares returns one closed sub-pixel contour around a circle', () => {
  const size = 41, field = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) field[y * size + x] = 12 - Math.hypot(x - 20, y - 20);
  const contours = marchingSquares(field, size, size, 0);
  assert.equal(contours.length, 1);
  for (const p of contours[0]) assert.ok(Math.abs(Math.hypot(p.x - 20, p.y - 20) - 12) < .05);
  assert.ok(Math.abs(polygonArea(contours[0]) - Math.PI * 144) / (Math.PI * 144) < .01);
});

test('Douglas–Peucker keeps the ends and drops collinear points', () => {
  const line = Array.from({ length: 11 }, (_, i) => ({ x: i, y: 0 }));
  assert.deepEqual(simplify(line, .01), [line[0], line[10]]);
  const corner = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }];
  assert.deepEqual(simplify(corner, .01), [corner[0], corner[2], corner[4]]);
});

test('a dark subject on a light background is traced at its edge, in image pixels with y up', () => {
  const prepared = prepareImage(image(100, 80, disk(55, 38, 25, BLACK, WHITE)));
  assert.equal(prepared.darkSubject, true);
  const { points, contourCount } = traceImage(prepared);
  assert.equal(contourCount, 1);
  for (const p of points) assert.ok(Math.abs(Math.hypot(p.x - 55, p.y + 38) - 25) < 1.5, `point ${p.x}, ${p.y}`);
  const bounds = pathBounds(points);
  assert.ok(Math.abs(bounds.cx - 55) < .5 && Math.abs(bounds.cy + 38) < .5);
});

test('a light subject on a dark background is detected without inverting, and invert selects the background', () => {
  const prepared = prepareImage(image(80, 80, disk(40, 40, 20, WHITE, BLACK)));
  assert.equal(prepared.darkSubject, false);
  const subject = pathBounds(traceImage(prepared).points);
  assert.ok(Math.abs(subject.scale - 20) < 1.5);
  const background = pathBounds(traceImage(prepared, { invert: true }).points);
  assert.ok(background.scale > 38, 'inverted outline follows the image frame');
});

test('a transparent background uses opacity, even for a white subject', () => {
  const prepared = prepareImage(image(60, 60, disk(30, 30, 18, WHITE, [0, 0, 0, 0])));
  assert.equal(prepared.usesAlpha, true);
  assert.ok(Math.abs(pathBounds(traceImage(prepared).points).scale - 18) < 1.5);
});

test('outline keeps only the outer boundary; all chains every contour into one closed stroke', () => {
  const ring = (x, y) => { const d = Math.hypot(x - 50, y - 50); return d < 40 && d > 20 ? BLACK : WHITE; };
  const prepared = prepareImage(image(100, 100, ring));
  const outline = traceImage(prepared, { mode: 'outline' }).points;
  assert.ok(outline.every(p => Math.hypot(p.x - 50, p.y + 50) > 37));
  const all = traceImage(prepared, { mode: 'all' });
  assert.equal(all.contourCount, 2);
  assert.ok(all.points.some(p => Math.hypot(p.x - 50, p.y + 50) < 23), 'inner edge is included');
  assert.ok(analyzePath(all.points).errors.every(Number.isFinite));
});

test('a blank image reports that no outline was found', () => {
  assert.throws(() => traceImage(prepareImage(image(20, 20, () => WHITE))), /輪廓/);
});

test('smoothing removes pointer jitter, keeps both endpoints and does not depend on drawing scale', () => {
  const noisy = Array.from({ length: 400 }, (_, i) => {
    const t = i / 399 * Math.PI * 1.5, wobble = i % 2 ? .04 : -.04;
    return { x: (1 + wobble) * Math.cos(t), y: (1 + wobble) * Math.sin(t) };
  });
  const smooth = smoothPath(noisy);
  assert.deepEqual(smooth[0], noisy[0]);
  assert.ok(Math.hypot(smooth.at(-1).x - noisy.at(-1).x, smooth.at(-1).y - noisy.at(-1).y) < 1e-9);
  const middle = smooth.slice(20, -20), radiusError = middle.map(p => Math.abs(Math.hypot(p.x, p.y) - 1));
  assert.ok(Math.max(...radiusError) < .015, `max radial deviation ${Math.max(...radiusError)}`);
  const scaled = smoothPath(noisy.map(p => ({ x: p.x * 300, y: p.y * 300 })));
  assert.equal(scaled.length, smooth.length);
  scaled.forEach((p, i) => { assert.ok(Math.abs(p.x / 300 - smooth[i].x) < 1e-9 && Math.abs(p.y / 300 - smooth[i].y) < 1e-9); });
  assert.deepEqual(smoothPath([{ x: 1, y: 1 }, { x: 1, y: 1 }]), [{ x: 1, y: 1 }, { x: 1, y: 1 }]);
});

test('every built-in shape is normalized and reconstructs closely at N = 128', () => {
  for (const name of Object.keys(SHAPES)) {
    const points = shapePath(name), bounds = pathBounds(points);
    assert.ok(points.length > 50, name);
    assert.ok(Math.abs(bounds.scale - 1) < .002 && Math.abs(bounds.cx) < .002 && Math.abs(bounds.cy) < .002, name);
    assert.ok(analyzePath(points).errors[128] < 1, name);
  }
});
