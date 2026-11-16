// Shared canvas + animation utilities for the VERILOT landing.
// A single requestAnimationFrame loop drives every 2D canvas (hero fallback,
// simulation streams, NIR waveform) so the page never runs competing loops.

export const ACC = '#00E5FF';
export const AMB = '#F59E0B';
export const RED = '#EF4444';

export const COL = {
  pet: ['rgba(200,232,245,.34)', 'rgba(225,245,255,.55)'],
  cap: ['#3D6FE0', '#86A6F2'],
  label: ['#E9E3D1', '#FFFFFF'],
  metal: ['#9AA2AC', '#DCE1E6'],
  pvc: ['rgba(236,228,196,.8)', '#F6F0D8'],
};
export const NAMES = { pvc: 'PVC', label: 'Label', cap: 'PP cap', metal: 'Metal' };

export function hexA(h, a) {
  const n = parseInt(h.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// Fit a canvas to its CSS box at device pixel ratio; cull when off-screen.
export function fit(c) {
  const r = c.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  if (r.bottom < -50 || r.top > window.innerHeight + 50) return null;
  const d = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.round(r.width * d), H = Math.round(r.height * d);
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  const x = c.getContext('2d');
  x.setTransform(d, 0, 0, d, 0, 0);
  return { x, w: r.width, h: r.height };
}

export function shape() {
  const n = 5 + ((Math.random() * 3) | 0), p = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.5, r = 0.55 + Math.random() * 0.45;
    p.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return p;
}

export function drawFlake(ctx, f, x, y, s, squash, hl) {
  const C = COL[f.type];
  ctx.save();
  ctx.translate(x, y); ctx.scale(1, squash); ctx.rotate(f.r); ctx.scale(s, s);
  ctx.beginPath();
  f.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  ctx.closePath();
  ctx.fillStyle = C[0]; ctx.fill();
  ctx.lineWidth = 1.2 / s; ctx.strokeStyle = hl && f.type === 'pet' ? hl : C[1]; ctx.stroke();
  ctx.restore();
}

export function bracket(ctx, x, y, w, h, col) {
  const k = Math.min(w, h) * 0.32;
  ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath();
  ctx.moveTo(x, y + k); ctx.lineTo(x, y); ctx.lineTo(x + k, y);
  ctx.moveTo(x + w - k, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + k);
  ctx.moveTo(x + w, y + h - k); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - k, y + h);
  ctx.moveTo(x + k, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - k);
  ctx.stroke();
}

export function poly(ctx, pts) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  ctx.closePath(); ctx.fill();
}

// Smooth interpolation used for lerp-tracked overlays.
export const lerp = (a, b, t) => a + (b - a) * t;

// ---- shared animation loop ----
const frames = [];
let running = false;
function loop(t) {
  for (let i = 0; i < frames.length; i++) frames[i](t);
  requestAnimationFrame(loop);
}
export function addFrame(fn) {
  frames.push(fn);
  if (!running) { running = true; requestAnimationFrame(loop); }
}
