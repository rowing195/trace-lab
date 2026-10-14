import { TAU, MAX_N, SAMPLE_COUNT, analyzePath, normalizePath, reconstruct, evaluate, examplePath, formulaText } from './fourier.js';

const $ = id => document.getElementById(id);
const drawCanvas = $('drawCanvas'), animationCanvas = $('animationCanvas'), errorChart = $('errorChart');
const surfaces = new Map();
const theme = getComputedStyle(document.documentElement);
const token = name => theme.getPropertyValue(name).trim();
const palette = {
  x: token('--x'), y: token('--y'), ink: token('--ink'), axis: '#b6ccd9',
  original: '#829ba9', outline: '#18364d30', muted: token('--muted'),
  xCircle: token('--x') + '90', yCircle: token('--y') + '9e',
  xArm: token('--x') + 'ba', yArm: token('--y') + 'ba',
};
const state = { model: null, points: [], draft: [], drawing: false, pointerId: null, n: 12, t: 0, playing: !matchMedia('(prefers-reduced-motion: reduce)').matches, speed: 1, reconstruction: [], example: 'heart', showOriginal: true, showCircles: true, showOutline: true, closed: true };
let toastTimer, lastTime = 0, uiTime = 0, chartMax = 64, nTimer;

function notify(message) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3000);
}

function surface(canvas) {
  const box = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = box.width, height = box.height;
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  }
  const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const result = { ctx, width, height }; surfaces.set(canvas, result); return result;
}

function line(ctx, x1, y1, x2, y2, color, width = 1, dash = []) {
  ctx.beginPath(); ctx.setLineDash(dash); ctx.strokeStyle = color; ctx.lineWidth = width;
  ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]);
}

function path(ctx, points, cx, cy, scale, color, width = 1.5, count = points.length, close = false) {
  if (!points.length) return;
  ctx.beginPath(); ctx.lineWidth = width; ctx.strokeStyle = color; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.moveTo(cx + points[0].x * scale, cy - points[0].y * scale);
  for (let i = 1; i < Math.min(count, points.length); i++) ctx.lineTo(cx + points[i].x * scale, cy - points[i].y * scale);
  if (close) ctx.closePath(); ctx.stroke();
}

function dot(ctx, x, y, radius, color) { ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.fillStyle = color; ctx.fill(); }

function renderDrawing() {
  const { ctx, width: w, height: h } = surface(drawCanvas), scale = Math.min(w, h) * .37;
  ctx.clearRect(0, 0, w, h);
  const points = state.drawing ? state.draft : state.points;
  if (points.length) {
    path(ctx, points, w / 2, h / 2, scale, palette.ink, 2.8);
    if (!state.drawing && state.closed) {
      const a = points.at(-1), b = points[0];
      line(ctx, w / 2 + a.x * scale, h / 2 - a.y * scale, w / 2 + b.x * scale, h / 2 - b.y * scale, palette.original, 1.3, [3, 4]);
    }
    dot(ctx, w / 2 + points[0].x * scale, h / 2 - points[0].y * scale, 3, palette.x);
  }
  $('drawPrompt').hidden = points.length > 0;
}

function save() {
  try { localStorage.setItem('trace-lab-v1', JSON.stringify({ points: state.points, n: state.n, closed: state.closed, example: state.example })); } catch { /* Storage is optional. */ }
}

function fit(points, example = null) {
  try {
    const normalized = normalizePath(points), model = analyzePath(normalized, { closed: state.closed });
    state.points = normalized; state.model = model; state.example = example; state.t = 0;
    updateFit(); renderDrawing(); save();
    $('pointCount').textContent = '1,024 個取樣點';
    document.querySelectorAll('[data-example]').forEach(button => {
      const active = button.dataset.example === example;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', active);
    });
  } catch (error) { notify(error.message); renderDrawing(); }
}

function formatError(value) { return value < .001 && value > 1e-8 ? '<0.001' : value.toFixed(3); }
function formatCoefficient(value, digits = 6) { return (Math.abs(value) < .5 * 10 ** -digits ? 0 : value).toFixed(digits); }

function updateFit() {
  const model = state.model, n = state.n;
  $('nInput').value = n; $('nSlider').value = n; $('nBadge').textContent = `N = ${n}`;
  document.querySelectorAll('[data-n]').forEach(button => {
    const active = Number(button.dataset.n) === n;
    button.setAttribute('aria-label', `N = ${button.dataset.n}`);
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', active);
  });
  $('emptyOverlay').hidden = !!model;
  for (const id of ['playButton', 'restartButton', 'progressSlider', 'copyButton', 'downloadButton']) $(id).disabled = !model;
  if (!model) {
    state.reconstruction = []; $('errorValue').textContent = '—'; $('stageError').textContent = '待繪製'; $('errorDescription').textContent = '等待你的第一筆';
    $('coefficientBody').replaceChildren(); $('coefficientCount').textContent = '尚無係數'; $('constantTerms').textContent = '—';
    $('formulaX').textContent = 'x(t) = cₓ + Σ [aₖ cos(kt) + bₖ sin(kt)]'; $('formulaY').textContent = 'y(t) = cᵧ + Σ [cₖ cos(kt) + dₖ sin(kt)]';
    $('chartSelection').textContent = '等待繪製'; $('coordinateReadout').textContent = 'x — · y —';
  } else {
    state.reconstruction = reconstruct(model, n);
    state.rx = model.coefficients.slice(0, n).reduce((sum, c) => sum + c.rx, 0);
    state.ry = model.coefficients.slice(0, n).reduce((sum, c) => sum + c.ry, 0);
    const error = model.errors[n]; $('errorValue').textContent = formatError(error); $('stageError').textContent = `${formatError(error)}%`;
    $('errorDescription').textContent = error < 1 ? '與原始線條非常接近' : error < 5 ? '已保留主要形狀' : '增加 N，找回更多細節';
    $('formulaX').textContent = `x(t) = ${formatCoefficient(model.cx, 4)} + Σₖ₌₁…${n} [aₖ cos(kt) + bₖ sin(kt)]`;
    $('formulaY').textContent = `y(t) = ${formatCoefficient(model.cy, 4)} + Σₖ₌₁…${n} [cₖ cos(kt) + dₖ sin(kt)]`;
    if (n === 0) { $('formulaX').textContent = `x(t) = ${formatCoefficient(model.cx)}`; $('formulaY').textContent = `y(t) = ${formatCoefficient(model.cy)}`; }
    $('coefficientCount').textContent = `${n} 階 · 每軸 ${2 * n + 1} 個係數`;
    $('constantTerms').textContent = `cₓ = ${formatCoefficient(model.cx)}，cᵧ = ${formatCoefficient(model.cy)}`;
    $('chartSelection').textContent = `N = ${n}`;
    renderCoefficients();
  }
  renderChart(); renderAnimation(); updatePlayback();
}

function renderCoefficients() {
  if (!$('coefficientDetails').open || !state.model) return;
  const rows = state.model.coefficients.slice(0, state.n).map(c => {
    const row = document.createElement('tr');
    for (const value of [c.k, ...[c.ax, c.bx, c.ay, c.by].map(value => formatCoefficient(value))]) { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); }
    return row;
  });
  $('coefficientBody').replaceChildren(...rows);
}

function setN(value, announce = false) {
  if (!Number.isFinite(value)) { $('nInput').value = state.n; if (announce) notify('N 請輸入 0 到 256 的整數。'); return; }
  const n = Math.max(0, Math.min(MAX_N, Math.round(value)));
  if (announce && value !== n) notify('N 已調整為 0 到 256 之間的整數。');
  state.n = n; state.t = 0; updateFit(); save();
}

function renderChart() {
  const { ctx, width: w, height: h } = surface(errorChart);
  ctx.clearRect(0, 0, w, h);
  const left = 32, right = w - 12, top = 10, bottom = h - 28;
  ctx.font = '13px "Segoe UI", sans-serif'; ctx.textBaseline = 'middle';
  const model = state.model, maxError = model ? Math.ceil(model.errors[0] / 10) * 10 || 10 : 40;
  chartMax = Math.max(64, Math.ceil(state.n / 64) * 64);
  for (let i = 0; i <= 2; i++) {
    const y = top + (bottom - top) * i / 2;
    ctx.fillStyle = palette.muted; ctx.textAlign = 'right'; ctx.fillText(String(Math.round(maxError * (1 - i / 2))), left - 8, y);
  }
  for (let i = 0; i <= 4; i++) { ctx.textAlign = 'center'; ctx.fillStyle = palette.muted; ctx.fillText(String(chartMax * i / 4), left + (right - left) * i / 4, h - 8); }
  if (!model) return;
  const x = n => left + n / chartMax * (right - left), y = value => bottom - value / maxError * (bottom - top);
  ctx.beginPath(); ctx.moveTo(left, bottom);
  for (let n = 0; n <= chartMax; n++) ctx.lineTo(x(n), y(model.errors[n]));
  ctx.lineTo(right, bottom); ctx.closePath(); ctx.fillStyle = palette.x + '0d'; ctx.fill();
  ctx.beginPath(); for (let n = 0; n <= chartMax; n++) n ? ctx.lineTo(x(n), y(model.errors[n])) : ctx.moveTo(x(n), y(model.errors[n]));
  ctx.strokeStyle = palette.x; ctx.lineWidth = 1.8; ctx.stroke();
  line(ctx, x(state.n), top, x(state.n), bottom, palette.xCircle, 1, [3, 3]);
  dot(ctx, x(state.n), y(model.errors[state.n]), 4, '#fff'); dot(ctx, x(state.n), y(model.errors[state.n]), 2.5, palette.x);
  errorChart.setAttribute('aria-label', `N 從 0 到 ${chartMax} 的誤差曲線。目前 N = ${state.n}，錯誤率 ${model.errors[state.n].toFixed(3)}%。`);
}

function renderAnimation() {
  const { ctx, width: w, height: h } = surfaces.get(animationCanvas) || surface(animationCanvas);
  ctx.clearRect(0, 0, w, h);
  if (!state.model) return;
  const model = state.model, progress = Math.min(1, state.t), t = progress * TAU;
  const centerX = w * .68, centerY = h * .66, xDockY = h * .26, yDockX = w * .215;
  const maxRX = Math.max(1, state.rx), maxRY = Math.max(1, state.ry);
  const scale = Math.min(w * .22 / maxRX, h * .19 / maxRX, w * .17 / maxRY, h * .25 / maxRY, w * .24, h * .26);
  const reach = scale * 1.2;
  line(ctx, centerX - reach, centerY, centerX + reach, centerY, palette.axis, 1);
  line(ctx, centerX, centerY - reach, centerX, centerY + reach, palette.axis, 1);
  ctx.font = '13px "Segoe UI", sans-serif'; ctx.fillStyle = palette.muted; ctx.textAlign = 'left';
  ctx.fillText('x', centerX + reach + 5, centerY + 3); ctx.fillText('y', centerX - 3, centerY - reach - 7);
  if (state.showOriginal) { ctx.setLineDash([3, 5]); path(ctx, model.samples, centerX, centerY, scale, palette.original, 1.25, model.samples.length, true); ctx.setLineDash([]); }
  if (state.showOutline) path(ctx, state.reconstruction, centerX, centerY, scale, palette.outline, 1.5);
  const point = evaluate(model, state.n, t);
  const endX = centerX + point.x * scale, endY = centerY - point.y * scale;
  if (state.showCircles) {
    let xx = centerX + model.cx * scale, xy = xDockY;
    let yx = yDockX, yy = centerY - model.cy * scale;
    dot(ctx, xx, xy, 2.3, palette.x); dot(ctx, yx, yy, 2.3, palette.y);
    for (const c of model.coefficients.slice(0, state.n)) {
      const angleX = c.k * t - c.phaseX, angleY = c.k * t - c.phaseY;
      const nextX = xx + c.rx * scale * Math.cos(angleX), nextXY = xy + c.rx * scale * Math.sin(angleX);
      const nextYX = yx + c.ry * scale * Math.sin(angleY), nextY = yy - c.ry * scale * Math.cos(angleY);
      if (c.rx * scale > .35) { ctx.beginPath(); ctx.arc(xx, xy, c.rx * scale, 0, TAU); ctx.strokeStyle = palette.xCircle; ctx.lineWidth = 1.15; ctx.stroke(); line(ctx, xx, xy, nextX, nextXY, palette.xArm, 1.1); }
      if (c.ry * scale > .35) { ctx.beginPath(); ctx.arc(yx, yy, c.ry * scale, 0, TAU); ctx.strokeStyle = palette.yCircle; ctx.lineWidth = 1.15; ctx.stroke(); line(ctx, yx, yy, nextYX, nextY, palette.yArm, 1.1); }
      xx = nextX; xy = nextXY; yx = nextYX; yy = nextY;
    }
    line(ctx, xx, xy, endX, endY, palette.xCircle, 1, [3, 5]); line(ctx, yx, yy, endX, endY, palette.yCircle, 1, [3, 5]);
    dot(ctx, xx, xy, 3, palette.x); dot(ctx, yx, yy, 3, palette.y);
    ctx.font = 'italic 16px "STIX Two Text", Georgia, serif'; ctx.textAlign = 'center'; ctx.fillStyle = palette.x; ctx.fillText('x(t)', centerX, Math.max(20, xDockY - state.rx * scale - 14));
    ctx.fillStyle = palette.y; ctx.fillText('y(t)', yDockX, Math.min(h - 44, centerY + state.ry * scale + 24));
  }
  const traceCount = Math.floor(progress * SAMPLE_COUNT) + 1;
  path(ctx, state.reconstruction, centerX, centerY, scale, palette.ink, 2.8, traceCount);
  const last = state.reconstruction[Math.min(traceCount - 1, SAMPLE_COUNT)];
  line(ctx, centerX + last.x * scale, centerY - last.y * scale, endX, endY, palette.ink, 2.8);
  dot(ctx, endX, endY, 5, '#fff'); dot(ctx, endX, endY, 3.4, palette.ink);
}

function updatePlayback() {
  $('playButton').setAttribute('aria-label', state.playing ? '暫停動畫' : '播放動畫');
  $('playLabel').textContent = state.playing ? '暫停' : '播放';
  $('playButton').querySelector('use').setAttribute('href', state.playing ? '#i-pause' : '#i-play');
  const progress = Math.min(1, state.t);
  $('progressSlider').value = Math.round(progress * 1000); $('progressLabel').textContent = `${Math.round(progress * 100)}%`;
  if (state.model) { const p = evaluate(state.model, state.n, progress * TAU); $('coordinateReadout').textContent = `x ${formatCoefficient(p.x, 3)} · y ${formatCoefficient(p.y, 3)}`; }
}

function tick(time) {
  const delta = Math.min((time - (lastTime || time)) / 1000, .05); lastTime = time;
  if (state.playing && state.model && !state.drawing && !document.hidden) {
    state.t += delta * state.speed / 14;
    if (state.t > 1.045) state.t = 0;
    const savedT = state.t; state.t = Math.min(1, savedT); renderAnimation();
    if (time - uiTime > 70) { updatePlayback(); uiTime = time; }
    state.t = savedT;
  }
  requestAnimationFrame(tick);
}

function pointerPoint(event) {
  const box = drawCanvas.getBoundingClientRect(), scale = Math.min(box.width, box.height) * .37;
  const x = Math.max(0, Math.min(box.width, event.clientX - box.left)), y = Math.max(0, Math.min(box.height, event.clientY - box.top));
  return { x: (x - box.width / 2) / scale, y: -(y - box.height / 2) / scale };
}
drawCanvas.addEventListener('pointerdown', event => {
  if (state.drawing || (event.pointerType === 'mouse' && event.button !== 0)) return;
  event.preventDefault(); state.drawing = true; state.pointerId = event.pointerId; state.draft = [pointerPoint(event)]; drawCanvas.setPointerCapture(event.pointerId); renderDrawing();
});
drawCanvas.addEventListener('pointermove', event => {
  if (!state.drawing || event.pointerId !== state.pointerId) return;
  const coalesced = event.getCoalescedEvents?.();
  for (const sample of coalesced?.length ? coalesced : [event]) {
    const point = pointerPoint(sample), last = state.draft.at(-1);
    if (state.draft.length < 12000 && Math.hypot(point.x - last.x, point.y - last.y) > .006) state.draft.push(point);
  }
  renderDrawing();
});
drawCanvas.addEventListener('pointerup', event => {
  if (!state.drawing || event.pointerId !== state.pointerId) return;
  state.drawing = false; state.pointerId = null;
  if (drawCanvas.hasPointerCapture(event.pointerId)) drawCanvas.releasePointerCapture(event.pointerId);
  if (state.draft.length < 4) { notify('請按住滑鼠拖曳，畫出一段線條。'); renderDrawing(); return; }
  fit(state.draft); state.draft = [];
});
function cancelDrawing() { if (state.drawing) { state.drawing = false; state.pointerId = null; state.draft = []; renderDrawing(); } }
drawCanvas.addEventListener('pointercancel', cancelDrawing); drawCanvas.addEventListener('lostpointercapture', cancelDrawing);

document.querySelectorAll('[data-example]').forEach(button => button.addEventListener('click', () => { fit(examplePath(button.dataset.example), button.dataset.example); }));
document.querySelectorAll('[data-n]').forEach(button => button.addEventListener('click', () => setN(Number(button.dataset.n))));
$('nInput').addEventListener('input', event => { clearTimeout(nTimer); if (event.target.value !== '') nTimer = setTimeout(() => setN(Number(event.target.value), true), 250); });
$('nInput').addEventListener('change', event => { clearTimeout(nTimer); setN(event.target.value === '' ? NaN : Number(event.target.value), true); });
$('nInput').addEventListener('keydown', event => { if (event.key === 'Enter') { clearTimeout(nTimer); setN(event.target.value === '' ? NaN : Number(event.target.value), true); } });
$('nSlider').addEventListener('input', event => { clearTimeout(nTimer); setN(Number(event.target.value)); });
$('closedToggle').addEventListener('change', event => { state.closed = event.target.checked; if (state.points.length) fit(state.points, state.example); else save(); });
for (const [id, key] of [['originalToggle', 'showOriginal'], ['circlesToggle', 'showCircles'], ['outlineToggle', 'showOutline']]) $(id).addEventListener('change', event => { state[key] = event.target.checked; renderAnimation(); });
$('clearButton').addEventListener('click', () => {
  state.points = []; state.model = null; state.draft = []; state.example = null; state.t = 0;
  document.querySelectorAll('[data-example]').forEach(button => { button.classList.remove('active'); button.setAttribute('aria-pressed', 'false'); });
  $('pointCount').textContent = '等待繪製'; updateFit(); renderDrawing(); save();
});
$('playButton').addEventListener('click', () => { state.playing = !state.playing; if (state.t >= 1) state.t = 0; updatePlayback(); });
$('restartButton').addEventListener('click', () => { state.t = 0; state.playing = true; renderAnimation(); updatePlayback(); });
$('speedSelect').addEventListener('change', event => { state.speed = Number(event.target.value); });
$('progressSlider').addEventListener('input', event => { state.playing = false; state.t = Number(event.target.value) / 1000; renderAnimation(); updatePlayback(); });
$('coefficientDetails').addEventListener('toggle', renderCoefficients);
errorChart.addEventListener('click', event => { if (!state.model) return; const box = errorChart.getBoundingClientRect(); setN(Math.round((event.clientX - box.left - 32) / (box.width - 44) * chartMax)); });
$('helpButton').addEventListener('click', () => $('helpDialog').showModal());
$('closeHelp').addEventListener('click', () => $('helpDialog').close());
$('helpDialog').addEventListener('click', event => { if (event.target === $('helpDialog')) { const r = event.target.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) event.target.close(); } });

function downloadFile(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type })), anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('copyButton').addEventListener('click', async () => {
  if (!state.model) return;
  const text = formulaText(state.model, state.n);
  try { await navigator.clipboard.writeText(text); notify('完整 X、Y 公式已複製。'); }
  catch { downloadFile(`fourier-N${state.n}-formula.txt`, text, 'text/plain;charset=utf-8'); notify('無法存取剪貼簿，已改為下載完整公式。'); }
});
$('downloadButton').addEventListener('click', () => {
  if (!state.model) return;
  const m = state.model;
  downloadFile(`fourier-N${state.n}.json`, JSON.stringify({ n: state.n, parameter: 't in [0, 2*pi]', coordinateSystem: 'Bounding box centered; longest side = 2; positive y upward', sampleCount: SAMPLE_COUNT, closed: state.closed, openPathBehavior: state.closed ? null : 'forward and reverse traversal', formula: { x: 'cx + sum(ax*cos(k*t) + bx*sin(k*t))', y: 'cy + sum(ay*cos(k*t) + by*sin(k*t))' }, cx: m.cx, cy: m.cy, nrmsePercent: m.errors[state.n], errorDefinition: '100 * sqrt(mean((x-x_fit)^2 + (y-y_fit)^2)) / boundingBoxDiagonal', coefficients: m.coefficients.slice(0, state.n), samples: m.samples }, null, 2), 'application/json');
  notify(`已匯出 N = ${state.n} 的係數與取樣點。`);
});
document.addEventListener('keydown', event => {
  if (/INPUT|SELECT|TEXTAREA|BUTTON/.test(event.target.tagName) || event.target.isContentEditable || $('helpDialog').open || !state.model) return;
  if (event.code === 'Space') { event.preventDefault(); $('playButton').click(); }
  if (event.key.toLowerCase() === 'r') $('restartButton').click();
});
document.addEventListener('visibilitychange', () => { lastTime = 0; });
function updateNavigation() {
  const current = $('formulaPanel').getBoundingClientRect().top < window.innerHeight * .6 ? '#formulaPanel' : '#studio';
  document.querySelectorAll('.header-nav a').forEach(link => {
    const active = link.getAttribute('href') === current;
    link.classList.toggle('nav-current', active);
    if (active) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');
  });
}
window.addEventListener('hashchange', updateNavigation);
window.addEventListener('scroll', updateNavigation, { passive: true });
window.addEventListener('resize', updateNavigation);
updateNavigation();
const resizeObserver = new ResizeObserver(() => { surface(animationCanvas); renderDrawing(); renderChart(); renderAnimation(); });
for (const canvas of [drawCanvas, animationCanvas, errorChart]) resizeObserver.observe(canvas);

let restored = false;
try {
  const saved = JSON.parse(localStorage.getItem('trace-lab-v1'));
  if (saved && Array.isArray(saved.points) && saved.points.length <= 12000 && Number.isInteger(saved.n) && saved.n >= 0 && saved.n <= MAX_N && saved.points.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y))) {
    state.n = saved.n; state.closed = saved.closed !== false; $('closedToggle').checked = state.closed;
    if (saved.points.length > 1) fit(saved.points, saved.example); else { updateFit(); renderDrawing(); }
    restored = true;
  }
} catch { /* Ignore unavailable storage or invalid saved data. */ }
if (!restored) fit(examplePath('heart'), 'heart');
requestAnimationFrame(tick);
