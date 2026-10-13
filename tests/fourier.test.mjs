import test from 'node:test';
import assert from 'node:assert/strict';
import { TAU, analyzePath, resamplePath, evaluate, examplePath, formulaText } from '../dist/fourier.js';

test('a circle is recovered with one harmonic and its scale is preserved', () => {
  const model = analyzePath(examplePath('circle'));
  assert.ok(model.errors[1] < .001);
  for (const t of [0, .6, 2, 4, 6]) { const p = evaluate(model, 1, t); assert.ok(Math.abs(p.x - Math.cos(t)) < .00002); assert.ok(Math.abs(p.y - Math.sin(t)) < .00002); }
});
test('equal arc-length sampling is independent of pointer sampling density', () => {
  const a = resamplePath([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], 8, false);
  const b = resamplePath([{ x: 0, y: 0 }, { x: .01, y: 0 }, { x: .2, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], 8, false);
  a.forEach((p, i) => { assert.ok(Math.abs(p.x - b[i].x) < 1e-10); assert.ok(Math.abs(p.y - b[i].y) < 1e-10); });
  assert.deepEqual(a[4], { x: 1, y: 1 });
});
test('reported error matches direct point-by-point RMSE and never increases', () => {
  const model = analyzePath(examplePath('star'));
  for (const n of [0, 1, 3, 12, 50, 128, 256]) {
    const mse = model.samples.reduce((sum, p, i) => { const q = evaluate(model, n, TAU * i / model.samples.length); return sum + (p.x - q.x) ** 2 + (p.y - q.y) ** 2; }, 0) / model.samples.length;
    assert.ok(Math.abs(model.errors[n] - 100 * Math.sqrt(mse) / model.diagonal) < 1e-7, `error at N=${n}`);
  }
  for (let i = 1; i < model.errors.length; i++) assert.ok(model.errors[i] <= model.errors[i - 1] + 1e-10);
});
test('open paths retrace without jumping, including vertical and horizontal strokes', () => {
  for (const points of [[{ x: 0, y: -1 }, { x: 0, y: 1 }], [{ x: -1, y: 0 }, { x: 1, y: 0 }]]) {
    const model = analyzePath(points, { closed: false });
    assert.ok(model.errors[128] < .02); assert.ok(model.errors.every(Number.isFinite));
    const first = evaluate(model, 30, 0), end = evaluate(model, 30, TAU);
    assert.ok(Math.hypot(first.x - end.x, first.y - end.y) < 1e-10);
  }
});
test('degenerate drawing is rejected and repeated points are handled', () => {
  assert.throws(() => analyzePath([{ x: 1, y: 1 }, { x: 1, y: 1 }]));
  const m = analyzePath([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 }]);
  assert.ok(m.errors.every(Number.isFinite));
});
test('exported formula reconstructs the selected N', () => {
  const model = analyzePath(examplePath('heart')), text = formulaText(model, 12);
  for (const axis of ['x', 'y']) {
    const expression = text.split('\n').find(l => l.startsWith(`${axis}(t)`)).split(' = ')[1];
    const fn = new Function('t', `return ${expression.replaceAll('cos(', 'Math.cos(').replaceAll('sin(', 'Math.sin(')}`);
    assert.ok(Math.abs(fn(1.25) - evaluate(model, 12, 1.25)[axis]) < 1e-7);
  }
});
