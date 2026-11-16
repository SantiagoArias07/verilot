// 2D canvas hero — the graceful fallback when WebGL / Three.js is unavailable.
// Renders the VERILOT M1 module over a moving conveyor of PET flake with live
// computer-vision bounding boxes. Ported from the original prototype.
import { ACC, AMB, RED, NAMES, hexA, fit, shape, drawFlake, bracket, poly, addFrame } from './util.js';

export function mountHero2D(canvas, o = {}) {
  if (!canvas) return;
  const F = [];
  let last = 0, sp = 0, kg = 784.2, batch = 404, jit = 0, init = false, nid = 1329;
  const types = ['cap', 'label', 'metal', 'pvc'];
  const speed = o.speed ?? 1;

  const mk = (x) => ({
    x, d: Math.random(), s: 3.5 + Math.random() * 5.5, r: Math.random() * 6.28,
    vr: (Math.random() - 0.5) * 0.4,
    type: Math.random() < 0.055 ? types[(Math.random() * 4) | 0] : 'pet',
    pts: shape(), tag: false, id: 0, conf: (0.9 + Math.random() * 0.09).toFixed(2),
  });

  addFrame((t) => {
    const g = fit(canvas); if (!g) { last = 0; return; }
    const { x: ctx, w, h } = g;
    const dt = Math.min(0.05, (t - (last || t)) / 1000); last = t;
    const A = ACC, wide = w > 900;
    const yf = h * 0.6, yn = h * 0.82, mx = wide ? w * 0.66 : w * 0.5;
    const mw = Math.min(w * 0.26, 340), mh = mw * 0.42, mb = yf - h * 0.16, fw = mw * 0.44;
    const v = Math.max(80, w * 0.11) * speed;
    const target = Math.round(w * 0.55);
    if (!init) { init = true; for (let i = 0; i < target; i++) F.push(mk(Math.random() * w)); F.sort((a, b) => a.d - b.d); }
    sp += dt * target * v / w;
    while (sp >= 1) { sp--; const f = mk(-20); let i = 0; while (i < F.length && F[i].d < f.d) i++; F.splice(i, 0, f); }
    ctx.clearRect(0, 0, w, h);
    let gr = ctx.createRadialGradient(mx, mb, 10, mx, mb, h * 0.9);
    gr.addColorStop(0, hexA(A, 0.09)); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
    gr = ctx.createLinearGradient(0, yf, 0, yn); gr.addColorStop(0, '#0D1015'); gr.addColorStop(1, '#1A1E25'); ctx.fillStyle = gr; ctx.fillRect(0, yf, w, yn - yf);
    const off = (t / 1000 * v) % 34; ctx.strokeStyle = 'rgba(255,255,255,.045)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let sx = -34 + off; sx < w + 34; sx += 34) { ctx.moveTo(sx, yf); ctx.lineTo(sx + (sx - mx) * 0.14, yn); } ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(0, yf - 1, w, 1); ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(0, yn, w, 1);
    ctx.fillStyle = '#0B0D11'; ctx.fillRect(0, yn + 1, w, h * 0.04);
    ctx.fillStyle = hexA(A, 0.06); ctx.fillRect(mx - fw, yf, fw * 2, yn - yf);
    for (let i = F.length - 1; i >= 0; i--) {
      const f = F[i], sc = 0.75 + 0.4 * f.d; f.x += v * sc * dt; f.r += f.vr * dt;
      if (f.x > w + 30) { F.splice(i, 1); continue; }
      if (f.x >= mx && !f.cross) { f.cross = 1; kg += 0.04; if (kg >= 850) { kg = 0; batch++; } }
      if (f.type !== 'pet' && !f.tag && f.x > mx - fw) { f.tag = true; f.id = nid++; }
    }
    for (const f of F) {
      const sc = 0.75 + 0.4 * f.d, y = yf + f.d * (yn - yf), inB = Math.abs(f.x - mx) < fw;
      if (f.type === 'pet' && f.d > 0.5) { ctx.fillStyle = 'rgba(200,232,245,.05)'; ctx.fillRect(f.x - f.s * sc * 3, y - 0.5, f.s * sc * 2.4, 1); }
      drawFlake(ctx, f, f.x, y, f.s * sc, 0.55, inB ? A : null);
    }
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    gr = ctx.createLinearGradient(0, mb, 0, yn); gr.addColorStop(0, hexA(A, 0.3)); gr.addColorStop(1, hexA(A, 0.03)); ctx.fillStyle = gr;
    poly(ctx, [[mx - mw * 0.3, mb], [mx + mw * 0.3, mb], [mx + fw, yn], [mx - fw, yn]]);
    for (let k = 0; k < 2; k++) {
      const ph = t * 0.0026 * speed + k * Math.PI, sx = mx - fw + (0.5 + 0.5 * Math.sin(ph)) * fw * 2;
      ctx.strokeStyle = k ? hexA(AMB, 0.7) : A; ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 16; ctx.lineWidth = k ? 1 : 2;
      ctx.beginPath(); ctx.moveTo(sx, yf); ctx.lineTo(sx + (sx - mx) * 0.14, yn); ctx.stroke();
      ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.moveTo(mx + (sx - mx) * 0.68, mb); ctx.lineTo(sx, yf + (yn - yf) * 0.5); ctx.stroke(); ctx.globalAlpha = 1;
    }
    ctx.restore();
    ctx.font = '500 10px "Geist Mono", monospace';
    for (const f of F) {
      if (!f.tag) continue;
      const life = 1 - Math.max(0, (f.x - (mx + fw)) / (w * 0.28)); if (life <= 0) continue;
      const sc = 0.75 + 0.4 * f.d, y = yf + f.d * (yn - yf), b = f.s * sc * 2.4 + 10;
      const col = (f.type === 'metal' || f.type === 'pvc') ? RED : AMB;
      ctx.globalAlpha = life; bracket(ctx, f.x - b / 2, y - b * 0.4, b, b * 0.8, col);
      const lbl = '#' + f.id + ' ' + NAMES[f.type].toUpperCase() + ' ' + f.conf, tw = ctx.measureText(lbl).width;
      const ly = y - b * 0.4 - 26;
      ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(f.x - b / 2, y - b * 0.4); ctx.lineTo(f.x - b / 2, ly + 15); ctx.stroke();
      ctx.fillStyle = 'rgba(8,9,12,.9)'; ctx.fillRect(f.x - b / 2, ly, tw + 12, 16);
      ctx.fillStyle = col; ctx.fillRect(f.x - b / 2, ly, 2, 16); ctx.fillText(lbl, f.x - b / 2 + 7, ly + 11.5); ctx.globalAlpha = 1;
    }
    const px = mw / 2 + 30, ptop = mb - mh * 1.08;
    gr = ctx.createLinearGradient(0, ptop, 0, yn); gr.addColorStop(0, '#2A2F38'); gr.addColorStop(1, '#12151A'); ctx.fillStyle = gr;
    ctx.fillRect(mx - px - 9, ptop - 7, px * 2 + 18, 10);
    ctx.fillRect(mx - px - 9, ptop, 9, yn + h * 0.04 - ptop); ctx.fillRect(mx + px, ptop, 9, yn + h * 0.04 - ptop);
    ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fillRect(mx - px - 9, ptop - 7, px * 2 + 18, 1);
    const L = mx - mw / 2, T = mb - mh, dx = mw * 0.1, dy = -mh * 0.32;
    ctx.fillStyle = '#383E48'; poly(ctx, [[L, T], [L + mw, T], [L + mw + dx, T + dy], [L + dx, T + dy]]);
    ctx.fillStyle = '#181B21'; poly(ctx, [[L + mw, T], [L + mw + dx, T + dy], [L + mw + dx, mb + dy], [L + mw, mb]]);
    gr = ctx.createLinearGradient(0, T, 0, mb); gr.addColorStop(0, '#2B3038'); gr.addColorStop(1, '#14171C'); ctx.fillStyle = gr; ctx.fillRect(L, T, mw, mh);
    ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(L, T, mw, 1);
    ctx.fillStyle = '#101216'; for (let i = 0; i < 5; i++) ctx.fillRect(L + mw * 0.72, T + mh * 0.3 + i * mh * 0.1, mw * 0.2, mh * 0.04);
    ctx.fillStyle = '#07080A'; ctx.beginPath(); ctx.arc(L + mw * 0.4, T + mh * 0.56, mh * 0.22, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = hexA(A, 0.7); ctx.beginPath(); ctx.arc(L + mw * 0.4 - mh * 0.07, T + mh * 0.5, 2, 0, 7); ctx.fill();
    ctx.save(); ctx.shadowColor = A; ctx.shadowBlur = 20; ctx.fillStyle = A; ctx.fillRect(mx - mw * 0.3, mb - 3, mw * 0.6, 3); ctx.restore();
    ctx.fillStyle = '#8B93A1'; ctx.font = '600 ' + Math.max(9, Math.round(mw * 0.036)) + 'px "Geist Mono", monospace'; ctx.fillText('VERILOT  M1', L + 14, T + 20);
    ctx.fillStyle = A; ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t * 0.006); ctx.beginPath(); ctx.arc(L + mw - 16, T + 16, 3, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    gr = ctx.createRadialGradient(w * 0.6, h * 0.55, h * 0.3, w * 0.6, h * 0.55, w * 0.8); gr.addColorStop(0, 'rgba(8,9,12,0)'); gr.addColorStop(1, 'rgba(8,9,12,.75)'); ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
    jit += dt;
    if (jit > 0.4) {
      jit = 0;
      if (o.kgEl) o.kgEl.textContent = kg.toFixed(1) + ' kg';
      if (o.petEl) o.petEl.textContent = (98.1 + (Math.random() - 0.5) * 0.2).toFixed(1) + '%';
      if (o.batchEl) o.batchEl.textContent = 'BATCH #' + String(batch).padStart(4, '0');
    }
  });
}
