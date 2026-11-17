// VERILOT Exchange — light-mode workspace wiring (3 views + drawer). Simulated data.
import { rankLots, FREIGHT_CONFIG } from './match.js';
import { CITIES, CITIES_BY_ID, LOTS, DEFAULT_SPEC } from './exchange-data.js';
import { postLead } from './lead.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const esc = (s) => String(s == null ? '' : s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
let currentMatches = [], currentSpec = DEFAULT_SPEC, mapApi = null;

/* ---------- nav (mobile menu) ---------- */
function initNav() {
  const burger = $('#navBurger'), menu = $('#navMenu');
  if (!burger || !menu) return;
  const setOpen = (o) => { burger.setAttribute('aria-expanded', String(o)); menu.classList.toggle('open', o); };
  burger.addEventListener('click', (e) => { e.stopPropagation(); setOpen(burger.getAttribute('aria-expanded') !== 'true'); });
  menu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setOpen(false)));
  document.addEventListener('click', (e) => { if (!e.target.closest('nav')) setOpen(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
}

/* ---------- workspace view switching ---------- */
async function showView(view) {
  $$('.xc-view').forEach((v) => v.classList.toggle('active', v.dataset.view === view));
  $$('.xc-side-item').forEach((b) => { const on = b.dataset.view === view; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
  if (view === 'map' && !mapApi) await initMap();
}
function initViews() {
  $$('.xc-side-item').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.classList.contains('active')));
    b.addEventListener('click', () => showView(b.dataset.view));
  });
}

/* ---------- city selects ---------- */
function fillCities() {
  const opts = CITIES.map((c) => `<option value="${c.id}">${esc(c.name)}, ${esc(c.country)}</option>`).join('');
  const buyerSel = $('#bCity');
  if (buyerSel) { buyerSel.innerHTML = opts; buyerSel.value = DEFAULT_SPEC.cityId; }
  $$('select[data-cities]').forEach((sel) => { sel.innerHTML = '<option value="">Select a city…</option>' + opts; });
}

/* ---------- matching demo ---------- */
function readSpec() {
  return {
    polymer: $('#bPolymer').value, minGrade: $('#bGrade').value,
    maxPvcPpm: +$('#bPvc').value, maxMoisturePct: +$('#bMoist').value,
    tons: +$('#bTons').value, cityId: $('#bCity').value, maxPricePerTon: +$('#bPrice').value,
  };
}
function setFill(input) {
  const min = +input.min, max = +input.max, v = +input.value;
  input.style.setProperty('--fill', (((v - min) / (max - min)) * 100).toFixed(1) + '%');
}
function bar(label, v, weightPct) {
  return `<div class="xc-bar"><span class="xc-bar-l">${label} <em>${weightPct}%</em></span>
    <span class="xc-bar-t"><i style="width:${(v * 100).toFixed(0)}%"></i></span>
    <span class="xc-bar-v">${(v * 100).toFixed(0)}</span></div>`;
}
function card(m, i) {
  const L = m.lot, pct = Math.round(m.total * 100);
  return `<article class="xc-card">
    <div class="xc-card-top">
      <div>
        <div class="xc-card-city">${esc(m.sellerCity.name)}, ${esc(m.sellerCity.country)}</div>
        <div class="xc-card-tags">
          <span class="xc-pill xc-pill-${L.grade}">${L.polymer} · GRADE ${L.grade}</span>
          <span class="xc-hash">${esc(L.hash)}</span>
          <span>${Math.round(L.confidence * 100)}% confidence</span>
        </div>
      </div>
      <div class="xc-score"><span class="xc-score-n">${pct}</span><span class="xc-score-u">match</span></div>
    </div>
    <div class="xc-metrics">
      <div><span>Available</span><b>${L.tons.toLocaleString('en-US')} t</b></div>
      <div><span>Sticker price</span><b>${money(L.pricePerTon)}/t</b></div>
      <div class="xc-landed"><span>Landed cost</span><b>${money(m.landedPerTon)}/t</b></div>
      <div><span>Est. freight</span><b>${money(m.freightTotal)}</b></div>
      <div><span>Truckloads</span><b>${m.trucks}</b></div>
      <div><span>Distance</span><b>${Math.round(m.distanceKm).toLocaleString('en-US')} km</b></div>
    </div>
    <div class="xc-bars">
      ${bar('Spec fit', m.breakdown.specFit, 30)}
      ${bar('Landed cost', m.breakdown.landedCost, 35)}
      ${bar('Confidence', m.breakdown.confidence, 20)}
      ${bar('Distance', m.breakdown.distance, 15)}
    </div>
    <button type="button" class="xc-card-cta" data-idx="${i}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z"/></svg>
      View Certificate &amp; Route</button>
  </article>`;
}
function renderDemo() {
  const spec = readSpec(); currentSpec = spec;
  const buyerCity = CITIES_BY_ID[spec.cityId];
  const { matches, rejected } = rankLots(LOTS, spec, CITIES_BY_ID, FREIGHT_CONFIG);
  currentMatches = matches;
  const summary = $('#matchSummary'), results = $('#matchResults');
  if (!matches.length) {
    summary.innerHTML = `<b>0</b> of ${LOTS.length} simulated lots meet this spec. Loosen a constraint — ${rejected.length ? 'raise max PVC/price or lower the minimum grade.' : ''}`;
    results.innerHTML = `<div class="xc-empty">No qualifying supply. The engine hard-filtered every lot on your constraints.</div>`;
    return;
  }
  const sumHtml = `<b>${matches.length}</b> of ${LOTS.length} simulated lots match · ranked by landed cost, spec fit, confidence &amp; distance · delivery to <b>${esc(buyerCity.name)}</b>`;
  if (summary.innerHTML !== sumHtml) summary.innerHTML = sumHtml;
  results.innerHTML = matches.map((m, i) => card(m, i)).join('');
}
function initDemo() {
  if (!$('#specForm')) return;
  fillCities();
  ['#bPvc', '#bMoist', '#bTons', '#bPrice'].forEach((s) => { const el = $(s); if (el) setFill(el); });
  const syncLabels = () => {
    $('#vPvc').textContent = $('#bPvc').value;
    $('#vMoist').textContent = (+$('#bMoist').value).toFixed(1);
    $('#vTons').textContent = $('#bTons').value;
    $('#vPrice').textContent = money(+$('#bPrice').value);
  };
  $('#specForm').addEventListener('input', (e) => {
    if (e.target.classList.contains('range-cyan')) setFill(e.target);
    syncLabels(); renderDemo();
  });
  $('#specForm').addEventListener('submit', (e) => e.preventDefault());
  $('#matchResults').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-idx]'); if (!btn) return;
    const m = currentMatches[+btn.dataset.idx]; if (m) openDrawer(m, currentSpec);
  });
  syncLabels(); renderDemo();
}

/* ---------- certificate & route drawer ---------- */
function routeSVG(a, b, w = 380, h = 128) {
  const pad = 24, midLng = (a.lng + b.lng) / 2, midLat = (a.lat + b.lat) / 2;
  const sc = Math.min((w - 2 * pad) / (Math.abs(a.lng - b.lng) || 1), (h - 2 * pad) / (Math.abs(a.lat - b.lat) || 1), 6);
  const P = (n) => [w / 2 + (n.lng - midLng) * sc, h / 2 - (n.lat - midLat) * sc];
  const [ax, ay] = P(a), [bx, by] = P(b), mx = (ax + bx) / 2, my = Math.min(ay, by) - 16;
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" style="display:block;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px">
    <path d="M${ax} ${ay} Q ${mx} ${my} ${bx} ${by}" fill="none" stroke="#0284C7" stroke-width="1.8" stroke-dasharray="4 4"/>
    <circle cx="${ax}" cy="${ay}" r="4.5" fill="#0284C7"/>
    <circle cx="${bx}" cy="${by}" r="4.5" fill="#fff" stroke="#0F172A" stroke-width="1.6"/>
    <text x="${ax}" y="${ay - 10}" font-family="Geist Mono,monospace" font-size="9.5" fill="#475569" text-anchor="middle">${esc(a.name)}</text>
    <text x="${bx}" y="${by + 17}" font-family="Geist Mono,monospace" font-size="9.5" fill="#475569" text-anchor="middle">${esc(b.name)}</text>
  </svg>`;
}
let drawerLastFocus = null;
function closeDrawer() {
  const root = $('#certDrawer'); if (!root) return;
  root.classList.remove('open'); root.setAttribute('aria-hidden', 'true'); document.body.style.overflow = '';
  document.getElementById('app')?.removeAttribute('inert');
  if (drawerLastFocus && drawerLastFocus.focus) drawerLastFocus.focus();
}
function openDrawer(m, spec) {
  const L = m.lot, sc = m.sellerCity, bc = CITIES_BY_ID[spec.cityId];
  const rate = FREIGHT_CONFIG.ratePerTonKm[sc.region] ?? FREIGHT_CONFIG.ratePerTonKm.default;
  const root = $('#certDrawer');
  root.innerHTML = `
    <div class="xc-drawer-back" data-close></div>
    <div class="xc-drawer" role="dialog" aria-modal="true" aria-label="Certificate and route">
      <div class="xc-drawer-head">
        <div><div class="xc-drawer-title">Certificate &amp; route</div><div style="font-size:12px;color:#475569;margin-top:3px">Batch ${esc(L.id)} · simulated</div></div>
        <button type="button" class="xc-drawer-close" data-close aria-label="Close">×</button>
      </div>
      <div class="xc-drawer-body">
        <div class="xc-passport">
          <div class="xc-passport-top"><span style="font-weight:600;color:#0F172A">${esc(sc.name)}, ${esc(sc.country)}</span><span class="xc-verified"><i></i>Simulated certificate</span></div>
          <div class="xc-kv">
            <div><span>Polymer</span><b>${L.polymer}</b></div>
            <div><span>Grade</span><b>${L.grade}</b></div>
            <div><span>Confidence</span><b>${Math.round(L.confidence * 100)}%</b></div>
            <div><span>PVC</span><b>${L.pvcPpm} ppm</b></div>
            <div><span>Moisture</span><b>${L.moisturePct}%</b></div>
            <div><span>Available</span><b>${L.tons.toLocaleString('en-US')} t</b></div>
            <div><span>Sticker price</span><b>${money(L.pricePerTon)}/t</b></div>
            <div><span>SHA-256</span><b style="font-family:'Geist Mono',monospace">${esc(L.hash)}</b></div>
          </div>
        </div>
        <div>
          <div class="xc-sec-h">Freight breakdown — ${esc(sc.name)} → ${esc(bc.name)}</div>
          ${routeSVG(sc, bc)}
          <div class="xc-freight" style="margin-top:14px">
            <div class="xc-freight-row"><span>Distance</span><b>${Math.round(m.distanceKm).toLocaleString('en-US')} km</b></div>
            <div class="xc-freight-row"><span>Rate (${esc(sc.region)})</span><b>$${rate.toFixed(2)} /t·km</b></div>
            <div class="xc-freight-row"><span>Quantity moved</span><b>${Math.round(m.qty).toLocaleString('en-US')} t</b></div>
            <div class="xc-freight-row"><span>Truckloads (22 t)</span><b>${m.trucks}</b></div>
            <div class="xc-freight-row"><span>Est. freight</span><b>${money(m.freightTotal)}</b></div>
            <div class="xc-freight-row total"><span>Landed cost</span><b>${money(m.landedPerTon)}/t</b></div>
          </div>
        </div>
        <div class="xc-drawer-note">Simulated certificate. In v1, this opens the public <code style="font-family:'Geist Mono',monospace">/verify/${esc(L.hash)}</code> page with real evidence and a cryptographic tamper check.</div>
      </div>
    </div>`;
  root.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeDrawer));
  const dlg = root.querySelector('.xc-drawer');
  dlg.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });
  drawerLastFocus = document.activeElement;
  root.classList.add('open'); root.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden';
  document.getElementById('app')?.setAttribute('inert', ''); // background untabbable while drawer is open
  dlg.setAttribute('tabindex', '-1'); dlg.focus();
}

/* ---------- industrial network map (lazy) ---------- */
async function initMap() {
  const canvas = $('#xcMap'); if (!canvas) return;
  const m = await import('./exchange-map.js');
  mapApi = m.mountMap(canvas, { onNode: showNode });
  const s = mapApi.stats;
  $('#stFacilities').textContent = s.facilities;
  $('#stTonnage').textContent = s.tonnage >= 1000 ? (s.tonnage / 1000).toFixed(1) + 'k t' : Math.round(s.tonnage) + ' t';
  $('#stLanes').textContent = s.lanes;
  $('#stConf').textContent = Math.round(s.avgConf * 100) + '%';
  $('#laneList').innerHTML = mapApi.lanes.map((l) =>
    `<div class="xc-lane"><span>${esc(l.from)} → ${esc(l.to)}</span><span style="display:flex;align-items:center;gap:8px"><span class="xc-lane-mode xc-lane-${l.mode === 'sea' ? 'sea' : 'truck'}">${l.mode === 'sea' ? 'Sea' : 'Truck'}</span>${l.km.toLocaleString('en-US')} km</span></div>`).join('');
}
function showNode(f) {
  const panel = $('#nodePanel');
  if (!f.certified) {
    panel.innerHTML = `<h4>${esc(f.name)}</h4><div class="xc-node-region">${esc(f.region)} · buyer market</div><div class="xc-node-empty" style="margin-top:12px">Destination node on an active lane. No certified supply listed here yet.</div>`;
    return;
  }
  panel.innerHTML = `<h4>${esc(f.name)}, ${esc(f.country)}</h4><div class="xc-node-region">${esc(f.region)} · certified facility</div>
    <div class="xc-node-rows">
      <div class="xc-node-row"><span>Certified lots</span><b>${f.lots}</b></div>
      <div class="xc-node-row"><span>Listed tonnage</span><b>${Math.round(f.tons).toLocaleString('en-US')} t</b></div>
      <div class="xc-node-row"><span>PET / PP</span><b>${Math.round(f.pet)} / ${Math.round(f.pp)} t</b></div>
      <div class="xc-node-row"><span>Avg confidence</span><b>${Math.round(f.avgConf * 100)}%</b></div>
    </div>`;
}

/* ---------- waitlist forms ---------- */
function cityName(id) { return CITIES_BY_ID[id] ? `${CITIES_BY_ID[id].name}, ${CITIES_BY_ID[id].country}` : ''; }
function wireWaitlist(formId, side) {
  const form = $('#' + formId); if (!form) return;
  const errEl = $('[data-err]', form), sent = $('[data-sent]', form);
  const emailEl = form.querySelector('input[name="email"]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const g = (n) => (form.querySelector(`[name="${n}"]`)?.value || '').trim();
    errEl.textContent = '';
    const emailOk = EMAIL_RE.test(emailEl.value);
    emailEl.classList.toggle('invalid', !emailOk);
    emailEl.setAttribute('aria-invalid', String(!emailOk));
    if (!emailOk) { errEl.textContent = 'Enter a valid work email.'; emailEl.focus(); return; }
    const city = cityName(g('city'));
    if (!g('company') && !city) { errEl.textContent = 'Add your company or city so we can place you.'; return; }
    const extra = side === 'seller'
      ? { Side: 'Seller', 'Monthly tons': g('monthlyTons'), City: city }
      : { Side: 'Buyer', 'Monthly tons': g('monthlyTons'), 'Delivery city': city, 'Required specs': g('specs'), 'Target $/t': g('targetPrice') };
    const btn = form.querySelector('button[type="submit"]');
    const label = btn.textContent; btn.disabled = true; btn.textContent = 'Sending…';
    const res = await postLead({
      source: 'exchange-' + side, email: g('email'), company: g('company'), location: city || g('company'),
      material: g('material'), throughput: g('monthlyTons') ? g('monthlyTons') + ' t/mo' : '', extra, website: g('website'),
    });
    btn.disabled = false; btn.textContent = label;
    if (!res.ok) { errEl.textContent = res.error || 'Something went wrong. Please try again.'; return; }
    form.querySelectorAll('.xc-field, .xc-submit').forEach((el) => { el.style.display = 'none'; });
    sent.hidden = false; sent.setAttribute('tabindex', '-1'); sent.focus();
  });
}

/* ---------- init ---------- */
function boot() {
  initNav();
  initViews();
  initDemo();
  wireWaitlist('sellerForm', 'seller');
  wireWaitlist('buyerForm', 'buyer');
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
