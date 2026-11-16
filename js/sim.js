// Live split-screen simulation + digital batch passport.
// Left  = permanently contaminated "Mixed Flake" stream (rolling alerts).
// Right = clean "Clear PET" stream; "Inject Contaminant" drops real debris that
// trips the NIR/vision sensor, spikes the spectral waveform, recomputes purity,
// confidence and a genuine SHA-256 hash, and walks the badge Grade A → D.
import { ACC, AMB, RED, NAMES, hexA, fit, shape, drawFlake, bracket, addFrame } from './util.js';
import { drawQR } from './qr.js';

const PASS = {
  A: { pet: '98.1%', w: '87%', conf: '95%', status: 'Certificate issued', tag: 'GRADE A', col: ACC },
  B: { pet: '96.2%', w: '75%', conf: '93%', status: 'Analyzing deviation', tag: 'GRADE B', col: AMB },
  C: { pet: '92.7%', w: '51%', conf: '94%', status: 'Downgraded A → C', tag: 'GRADE C', col: RED },
  D: { pet: '86.4%', w: '28%', conf: '96%', status: 'Rejected · Grade D', tag: 'GRADE D', col: '#DC2626' },
};
const SEED = { A: 7311, B: 1187, C: 2904, D: 4420 };

async function sha(str) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    return hex.slice(0, 4) + '…' + hex.slice(-4);
  } catch (e) {
    let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    const hex = (h >>> 0).toString(16).padStart(8, '0');
    return hex.slice(0, 4) + '…' + hex.slice(-4);
  }
}

export function initSimulation(els, opts = {}) {
  const reduced = !!opts.reduced;
  const state = { grade: 'A', contam: 0, leftCount: 0, alerts: [] };
  let injectUntil = 0, spikeUntil = 0, lastInjectAt = 0, lA = 0, renderSeq = 0;
  const t0 = performance.now();
  const streams = {}; // side -> { F } so reset() can purge in-flight debris

  // ---- digital batch passport ----
  async function renderPassport() {
    const token = ++renderSeq; // guards the async hash write against overlapping renders
    const g = state.grade, P = PASS[g];
    if (els.ppGrade) { els.ppGrade.textContent = g; els.ppGrade.style.color = P.col; }
    if (els.ppTag) els.ppTag.textContent = P.tag;
    if (els.ppDot) { els.ppDot.style.background = P.col; els.ppDot.style.boxShadow = `0 0 10px ${P.col}`; }
    if (els.ppStatus) { els.ppStatus.textContent = P.status; els.ppStatus.style.color = P.col; }
    if (els.ppPet) els.ppPet.textContent = P.pet;
    if (els.ppBar) { els.ppBar.style.width = P.w; els.ppBar.style.background = P.col; }
    if (els.ppConf) els.ppConf.textContent = P.conf;
    const h = await sha(`VERILOT|0402|PET:${P.pet}|conf:${P.conf}|GRADE:${g}|t:${Math.floor(performance.now())}`);
    if (token !== renderSeq) return; // a newer render superseded this one
    if (els.ppHash) els.ppHash.textContent = h;
    drawQR(els.qrSmall, SEED[g], '#08090C', '#EEF1F5');
  }
  drawQR(els.qrBig, 5521, '#0B0D11', '#EEF1F5');
  renderPassport();

  function pushAlert(type, conf) {
    const now = performance.now();
    if (now - lA < 700) return; lA = now;
    const s = (now - t0) / 1000;
    const ts = 'T+' + String(Math.floor(s / 60)).padStart(2, '0') + ':' + (s % 60).toFixed(1).padStart(4, '0');
    state.alerts = [{ id: now, name: NAMES[type], conf, ts }, ...state.alerts].slice(0, 4);
    state.leftCount++;
    if (els.leftCount) els.leftCount.textContent = state.leftCount;
    if (els.alertList) {
      els.alertList.innerHTML = state.alerts.map((a) =>
        `<div style="display:grid; grid-template-columns:auto 1fr auto; gap:12px; align-items:center; padding:9px 12px; background:rgba(239,68,68,0.07); border:1px solid rgba(239,68,68,0.22); border-radius:8px; font-family:'Geist Mono',monospace; font-size:12px;">`
        + `<span style="color:#EF4444;">●</span>`
        + `<span style="color:#EEF1F5;">${a.name} detected · conf ${a.conf}</span>`
        + `<span style="color:#8B93A1;">${a.ts}</span></div>`).join('');
    }
  }

  function onDetect(side, type, conf) {
    if (side === 'L') { pushAlert(type, conf); return; }
    // right stream: each physical contaminant crossing spikes the NIR waveform.
    // The grade itself is driven by the scripted inject timeline below.
    spikeUntil = performance.now() + 620;
  }

  // ---- stream canvases ----
  function mkStream(c, side) {
    if (!c) return;
    const F = []; let last = 0, sp = 0, lastHit = -1e9, staticKey = '';
    streams[side] = { F };
    const types = ['pvc', 'label', 'cap', 'metal'];
    addFrame((t) => {
      const g = fit(c); if (!g) { last = 0; return; }
      const { x: ctx, w, h } = g;
      if (reduced) { const key = w + 'x' + h + state.grade; if (key === staticKey) return; staticKey = key; drawStreamStatic(ctx, w, h, side); return; }
      const dt = Math.min(0.05, (t - (last || t)) / 1000); last = t;
      const A = ACC, sy = h * 0.42, inj = side === 'R' && performance.now() < injectUntil;
      const rate = side === 'L' ? 0.2 : (inj ? 0.6 : 0);
      sp += dt * 16;
      while (sp >= 1) {
        sp--;
        F.push({ x: w * 0.14 + Math.random() * w * 0.72, y: -12, vy: 70 + Math.random() * 50, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 3, tb: Math.random() * 6.28, s: 4 + Math.random() * 5, type: Math.random() < rate ? types[(Math.random() * 4) | 0] : 'pet', pts: shape(), hit: 0, conf: (0.88 + Math.random() * 0.11).toFixed(2) });
      }
      ctx.clearRect(0, 0, w, h);
      const bad = side === 'L' || inj || state.grade !== 'A', flash = t - lastHit < 350;
      const SC = bad ? (flash ? RED : AMB) : A;
      ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(w * 0.1, 0); ctx.lineTo(w * 0.1, h); ctx.moveTo(w * 0.9, 0); ctx.lineTo(w * 0.9, h); ctx.stroke();
      let gr = ctx.createLinearGradient(0, sy - 60, 0, sy + 60); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, hexA(SC, 0.16)); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gr; ctx.fillRect(w * 0.1, sy - 60, w * 0.8, 120);
      for (let i = F.length - 1; i >= 0; i--) {
        const f = F[i]; f.vy += 50 * dt; f.y += f.vy * dt; f.r += f.vr * dt; f.tb += dt * 2.2;
        if (f.y > h + 20) { F.splice(i, 1); continue; }
        if (!f.hit && f.y >= sy) { f.hit = t; if (f.type !== 'pet') { lastHit = t; onDetect(side, f.type, f.conf); } }
      }
      for (const f of F) drawFlake(ctx, f, f.x, f.y, f.s, 0.3 + 0.7 * Math.abs(Math.cos(f.tb)), f.hit && t - f.hit < 260 ? A : null);
      ctx.save(); ctx.shadowColor = SC; ctx.shadowBlur = 16; ctx.fillStyle = SC; ctx.fillRect(w * 0.1, sy - 1, w * 0.8, 2); ctx.restore();
      ctx.fillStyle = '#1A1E25'; ctx.fillRect(0, sy - 18, w * 0.1, 36); ctx.fillRect(w * 0.9, sy - 18, w * 0.1, 36);
      ctx.fillStyle = SC; ctx.fillRect(w * 0.1 - 3, sy - 8, 3, 16); ctx.fillRect(w * 0.9, sy - 8, 3, 16);
      ctx.fillStyle = '#8B93A1'; ctx.font = '500 10px "Geist Mono", monospace'; ctx.fillText('NIR + VISION', 12, sy - 26);
      for (const f of F) {
        if (!f.hit || f.type === 'pet') continue;
        const b = f.s * 2.6 + 8; bracket(ctx, f.x - b / 2, f.y - b / 2, b, b, RED);
        ctx.fillStyle = RED; ctx.fillText(NAMES[f.type].toUpperCase() + ' ' + f.conf, f.x + b / 2 + 4, f.y + 3);
      }
    });
  }

  // ---- NIR spectral waveform (oscilloscope) ----
  function mkNir(c) {
    if (!c) return;
    const N = 90, buf = new Array(N).fill(0.4);
    let nirKey = '';
    addFrame((t) => {
      const g = fit(c); if (!g) return;
      const { x: ctx, w, h } = g;
      if (reduced) { const key = w + 'x' + h; if (key === nirKey) return; nirKey = key; drawNirStatic(ctx, w, h); return; }
      const now = performance.now();
      const hot = now < spikeUntil, k = hot ? (spikeUntil - now) / 620 : 0;
      const base = 0.4 + 0.10 * Math.sin(t * 0.004) + 0.05 * Math.sin(t * 0.013 + 1);
      const spike = k > 0 ? (0.34 + 0.12 * Math.random()) * k : 0;
      buf.push(Math.min(0.96, base + spike + (Math.random() - 0.5) * 0.03)); buf.shift();
      ctx.clearRect(0, 0, w, h);
      // baseline grid
      ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, h * 0.5); ctx.lineTo(w, h * 0.5); ctx.stroke();
      const line = hot ? (spike > 0.25 ? RED : AMB) : ACC;
      // fill under curve
      ctx.beginPath(); ctx.moveTo(0, h);
      for (let i = 0; i < N; i++) { const px = (i / (N - 1)) * w, py = h * (1 - buf[i]); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      ctx.lineTo(w, h); ctx.closePath();
      ctx.fillStyle = hexA(line.startsWith('#') ? line : ACC, 0.12); ctx.fill();
      // stroke
      ctx.beginPath();
      for (let i = 0; i < N; i++) { const px = (i / (N - 1)) * w, py = h * (1 - buf[i]); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      ctx.strokeStyle = line; ctx.lineWidth = 1.4; ctx.shadowColor = line; ctx.shadowBlur = hot ? 8 : 4; ctx.stroke(); ctx.shadowBlur = 0;
    });
  }

  // ---- reduced-motion static renderers + evidence thumbnails ----
  function drawStreamStatic(ctx, w, h, side) {
    const sy = h * 0.42, bad = side === 'L' || state.grade !== 'A', SC = bad ? AMB : ACC;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(w * 0.1, 0); ctx.lineTo(w * 0.1, h); ctx.moveTo(w * 0.9, 0); ctx.lineTo(w * 0.9, h); ctx.stroke();
    let s = side === 'L' ? 91 : 53; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 24; i++) {
      const fx = w * 0.12 + rnd() * w * 0.76, fy = rnd() * h, r = 3 + rnd() * 4, bad2 = side === 'L' && rnd() < 0.16;
      ctx.fillStyle = bad2 ? hexA(RED, 0.55) : `rgba(200,232,245,${0.14 + rnd() * 0.2})`;
      ctx.beginPath(); ctx.ellipse(fx, fy, r, r * 0.6, rnd() * 6, 0, 7); ctx.fill();
      if (bad2) bracket(ctx, fx - 8, fy - 8, 16, 16, RED);
    }
    ctx.save(); ctx.shadowColor = SC; ctx.shadowBlur = 10; ctx.fillStyle = SC; ctx.fillRect(w * 0.1, sy - 1, w * 0.8, 2); ctx.restore();
    ctx.fillStyle = '#1A1E25'; ctx.fillRect(0, sy - 18, w * 0.1, 36); ctx.fillRect(w * 0.9, sy - 18, w * 0.1, 36);
    ctx.fillStyle = SC; ctx.fillRect(w * 0.1 - 3, sy - 8, 3, 16); ctx.fillRect(w * 0.9, sy - 8, 3, 16);
    ctx.fillStyle = '#8B93A1'; ctx.font = '500 10px "Geist Mono", monospace'; ctx.fillText('NIR + VISION', 12, sy - 26);
  }
  function drawNirStatic(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.beginPath(); ctx.moveTo(0, h * 0.5); ctx.lineTo(w, h * 0.5); ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i <= 90; i++) { const u = i / 90, px = u * w, v = 0.4 + 0.16 * Math.exp(-((u - 0.45) ** 2) / 0.01) + 0.1 * Math.exp(-((u - 0.72) ** 2) / 0.006), py = h * (1 - v); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.strokeStyle = ACC; ctx.lineWidth = 1.4; ctx.stroke();
  }
  function paintEvidence(c, seed, flagged) {
    const g = fit(c); if (!g) return false;
    const { x: ctx, w, h } = g;
    ctx.clearRect(0, 0, w, h);
    let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 8; i++) { const fx = rnd() * w, fy = rnd() * h, r = 1.6 + rnd() * 2.6; ctx.fillStyle = `rgba(200,232,245,${0.12 + rnd() * 0.22})`; ctx.beginPath(); ctx.ellipse(fx, fy, r, r * 0.65, rnd() * 6, 0, 7); ctx.fill(); }
    const bx = w * (flagged ? 0.56 : 0.42), by = h * 0.5, bs = flagged ? 13 : 11, col = flagged ? RED : ACC;
    bracket(ctx, bx - bs / 2, by - bs / 2, bs, bs, col);
    ctx.fillStyle = col; ctx.font = '600 7px "Geist Mono", monospace'; ctx.textBaseline = 'middle'; ctx.fillText(flagged ? 'PVC' : 'PET', bx + bs / 2 + 3, by);
    return true;
  }
  let evDone = false;
  addFrame(() => { if (evDone) return; const a = paintEvidence(els.ev1, 11, false), b = paintEvidence(els.ev2, 29, true); if (a && b) evDone = true; });

  mkStream(els.simL, 'L');
  mkStream(els.simR, 'R');
  mkNir(els.nirWave);

  let injectTimers = [];
  const clearTimers = () => { injectTimers.forEach(clearTimeout); injectTimers = []; };
  return {
    inject() {
      clearTimers();
      injectUntil = performance.now() + 3200; lastInjectAt = performance.now();
      // cinematic, reliable Grade A → D walk as debris crosses the scanner
      [[380, 'B'], [1200, 'C'], [2200, 'D']].forEach(([ms, g]) => {
        injectTimers.push(setTimeout(() => { state.grade = g; renderPassport(); }, ms));
      });
    },
    reset() {
      clearTimers();
      injectUntil = 0; spikeUntil = 0; state.contam = 0; state.grade = 'A';
      // purge any in-flight debris so leftover particles can't re-trip the sensor
      if (streams.R) for (const f of streams.R.F) { if (f.type !== 'pet') f.type = 'pet'; }
      renderPassport();
    },
    getGrade: () => state.grade,
  };
}
