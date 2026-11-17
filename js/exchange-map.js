// Industrial Network Map — self-contained light canvas (no external deps).
// Plots certified facilities (sized by listed tonnage) + simulated freight lanes
// (truck / maritime) with animated flow, and reports clicks on plant nodes.
import { CITIES, CITIES_BY_ID, LOTS } from './exchange-data.js';
import { haversineKm, gradeToNum } from './match.js';

const ACC = '#0284C7', ACC2 = '#0891B2', INK = '#0F172A', MUTED = '#64748B', LINE = '#E2E8F0';

// a few destination/buyer markets referenced by lanes but not certified facilities
const EXTRA = {
  aus: { id: 'aus', name: 'Austin', country: 'US', region: 'US', lat: 30.27, lng: -97.74 },
  lrd: { id: 'lrd', name: 'Laredo', country: 'US', region: 'US', lat: 27.51, lng: -99.51 },
};
const NODE = { ...CITIES_BY_ID, ...EXTRA };

export const LANES = [
  { from: 'qro', to: 'hou', mode: 'truck', tons: 420 },
  { from: 'mty', to: 'aus', mode: 'truck', tons: 360 },
  { from: 'gdl', to: 'lrd', mode: 'truck', tons: 280 },
  { from: 'rtm', to: 'str', mode: 'truck', tons: 240 },
  { from: 'szx', to: 'osa', mode: 'sea', tons: 610 },
  { from: 'bom', to: 'rtm', mode: 'sea', tons: 540 },
];

// aggregate listed supply per facility
export function facilityStats() {
  const by = {};
  for (const lot of LOTS) {
    const f = (by[lot.cityId] ||= { cityId: lot.cityId, lots: 0, tons: 0, pet: 0, pp: 0, confSum: 0, gradeSum: 0 });
    f.lots++; f.tons += lot.tons; f[lot.polymer === 'PET' ? 'pet' : 'pp'] += lot.tons;
    f.confSum += lot.confidence; f.gradeSum += gradeToNum(lot.grade);
  }
  return Object.values(by).map((f) => ({
    ...CITIES_BY_ID[f.cityId], ...f,
    avgConf: f.confSum / f.lots, avgGrade: f.gradeSum / f.lots,
  })).sort((a, b) => b.tons - a.tons);
}

export function networkStats(facilities) {
  const tonnage = facilities.reduce((s, f) => s + f.tons, 0);
  const conf = LOTS.reduce((s, l) => s + l.confidence, 0) / LOTS.length;
  return { facilities: facilities.length, tonnage, lanes: LANES.length, avgConf: conf };
}

export function laneRows() {
  return LANES.map((l) => {
    const a = NODE[l.from], b = NODE[l.to];
    return { from: a.name, to: b.name, mode: l.mode, tons: l.tons, km: Math.round(haversineKm(a, b)) };
  });
}

export function mountMap(canvas, opts = {}) {
  const facilities = facilityStats();
  const byId = {}; facilities.forEach((f) => { byId[f.id] = f; });
  // node set = certified facilities + any lane endpoint
  const ids = new Set(facilities.map((f) => f.id));
  LANES.forEach((l) => { ids.add(l.from); ids.add(l.to); });
  const nodes = [...ids].map((id) => {
    const c = NODE[id], f = byId[id];
    const r = f ? 5 + Math.sqrt(f.tons) * 0.42 : 4;
    return { id, name: c.name, lat: c.lat, lng: c.lng, certified: !!f, r: Math.min(r, 16) };
  });

  const ctx = canvas.getContext('2d');
  let W = 1, H = 1, dpr = 1, proj = null, hoverId = null, activeId = null, raf = 0;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function layout() {
    const rect = canvas.getBoundingClientRect();
    W = rect.width; H = rect.height; if (!W || !H) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const lngs = nodes.map((n) => n.lng), lats = nodes.map((n) => n.lat);
    const minLng = Math.min(...lngs) - 18, maxLng = Math.max(...lngs) + 18;
    const minLat = Math.min(...lats) - 10, maxLat = Math.max(...lats) + 10;
    const pad = 30;
    const s = Math.min((W - 2 * pad) / (maxLng - minLng), (H - 2 * pad) / (maxLat - minLat));
    const midLng = (minLng + maxLng) / 2, midLat = (minLat + maxLat) / 2;
    proj = (lng, lat) => [W / 2 + (lng - midLng) * s, H / 2 - (lat - midLat) * s];
    nodes.forEach((n) => { [n.x, n.y] = proj(n.lng, n.lat); });
  }

  function drawGraticule() {
    ctx.strokeStyle = '#EEF2F7'; ctx.lineWidth = 1;
    for (let lng = -180; lng <= 180; lng += 15) { const [x] = proj(lng, 0); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let lat = -90; lat <= 90; lat += 15) { const [, y] = proj(0, lat); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  }

  function quad(a, b) {
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - Math.hypot(b.x - a.x, b.y - a.y) * 0.22;
    return { mx, my };
  }
  function bez(a, b, m, u) {
    const x = (1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * m.mx + u * u * b.x;
    const y = (1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * m.my + u * u * b.y;
    return [x, y];
  }

  function frame(t) {
    raf = requestAnimationFrame(frame);
    if (!proj || canvas.offsetParent === null) return; // paused when the map view is hidden
    ctx.clearRect(0, 0, W, H);
    drawGraticule();
    // lanes
    for (const l of LANES) {
      const a = nodes.find((n) => n.id === l.from), b = nodes.find((n) => n.id === l.to);
      if (!a || !b) continue;
      const m = quad(a, b), col = l.mode === 'sea' ? ACC2 : ACC;
      ctx.strokeStyle = col; ctx.globalAlpha = 0.4; ctx.lineWidth = 1.6;
      ctx.setLineDash(l.mode === 'sea' ? [5, 5] : []);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(m.mx, m.my, b.x, b.y); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      // flow dot
      const speed = l.mode === 'sea' ? 0.00006 : 0.0001;
      const u = reduced ? 0.5 : (t * speed + (a.x % 7) / 7) % 1;
      const [fx, fy] = bez(a, b, m, u);
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(fx, fy, 2.6, 0, 7); ctx.fill();
    }
    // nodes
    for (const n of nodes) {
      const hot = n.id === hoverId || n.id === activeId;
      if (n.certified) {
        if (hot) { ctx.fillStyle = 'rgba(2,132,199,0.12)'; ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 8, 0, 7); ctx.fill(); }
        ctx.fillStyle = ACC; ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, 7); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      } else {
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, 7); ctx.fill();
        ctx.strokeStyle = hot ? ACC : '#94A3B8'; ctx.lineWidth = 1.6; ctx.stroke();
      }
    }
    // labels — bigger facilities win; skip collisions so dense clusters stay legible
    ctx.font = '600 11px Geist, system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const leftLabel = ['Guadalajara', 'Rotterdam', 'Laredo', 'Barcelona', 'Los Angeles'];
    const cand = nodes.filter((n) => n.certified || n.id === hoverId || n.id === activeId)
      .sort((a, b) => ((b.id === hoverId || b.id === activeId) ? 1e6 : b.r) - ((a.id === hoverId || a.id === activeId) ? 1e6 : a.r));
    const drawn = [];
    for (const n of cand) {
      const forced = n.id === hoverId || n.id === activeId;
      const tw = ctx.measureText(n.name).width;
      const tx = leftLabel.includes(n.name) ? n.x - (n.r + 6) - tw : n.x + (n.r + 6);
      const box = { x: Math.max(2, Math.min(tx, W - tw - 6)), y: n.y - 7, w: tw + 4, h: 14 };
      if (!forced && drawn.some((d) => box.x < d.x + d.w && box.x + box.w > d.x && box.y < d.y + d.h && box.y + box.h > d.y)) continue;
      drawn.push(box);
      ctx.fillStyle = n.id === activeId ? ACC : INK;
      ctx.fillText(n.name, box.x, n.y);
    }
  }

  function hit(ev) {
    const rect = canvas.getBoundingClientRect();
    const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
    let best = null, bd = Infinity;
    for (const n of nodes) {
      const d = Math.hypot(n.x - mx, n.y - my), reach = Math.max(n.r + 6, 10);
      if (d <= reach && d < bd) { best = n; bd = d; } // nearest node within its OWN drawn radius
    }
    return best;
  }
  canvas.addEventListener('mousemove', (e) => { const n = hit(e); hoverId = n ? n.id : null; canvas.style.cursor = n ? 'pointer' : 'default'; });
  canvas.addEventListener('click', (e) => { const n = hit(e); if (n) { activeId = n.id; opts.onNode && opts.onNode(byId[n.id] || { ...NODE[n.id], certified: false }); } });

  const ro = new ResizeObserver(layout); ro.observe(canvas); layout();
  raf = requestAnimationFrame(frame);

  return {
    facilities, lanes: laneRows(), stats: networkStats(facilities),
    focus(id) { activeId = id; },
    dispose() { cancelAnimationFrame(raf); ro.disconnect(); },
  };
}
