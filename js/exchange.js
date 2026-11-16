// VERILOT Exchange — preview page wiring (demo + waitlist). All data is simulated.
import { rankLots, FREIGHT_CONFIG } from './match.js';
import { CITIES, CITIES_BY_ID, LOTS, DEFAULT_SPEC } from './exchange-data.js';
import { postLead } from './lead.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const esc = (s) => String(s == null ? '' : s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

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

/* ---------- section reveal ---------- */
function initReveal() {
  const items = $$('[data-reveal]');
  if (reduced || !('IntersectionObserver' in window)) { items.forEach((el) => el.classList.add('in')); return; }
  const io = new IntersectionObserver((ents) => {
    ents.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
  }, { threshold: 0.1 });
  items.forEach((el) => io.observe(el));
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
    polymer: $('#bPolymer').value,
    minGrade: $('#bGrade').value,
    maxPvcPpm: +$('#bPvc').value,
    maxMoisturePct: +$('#bMoist').value,
    tons: +$('#bTons').value,
    cityId: $('#bCity').value,
    maxPricePerTon: +$('#bPrice').value,
  };
}

function setFill(input) {
  const min = +input.min, max = +input.max, v = +input.value;
  input.style.setProperty('--fill', (((v - min) / (max - min)) * 100).toFixed(1) + '%');
}

function miniMap(seller, buyer) {
  const W = 128, H = 64, pad = 8;
  const px = (lng) => pad + ((lng + 180) / 360) * (W - 2 * pad);
  const py = (lat) => pad + ((90 - lat) / 180) * (H - 2 * pad);
  const sx = px(seller.lng), sy = py(seller.lat), bx = px(buyer.lng), by = py(buyer.lat);
  const mx = (sx + bx) / 2, my = Math.min(sy, by) - 10;
  return `<svg class="xc-map" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
    <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="6" fill="#0E1116" stroke="#1A1E26"/>
    <path d="M${sx} ${sy} Q ${mx} ${my} ${bx} ${by}" fill="none" stroke="#00E5FF" stroke-width="1.2" stroke-dasharray="3 3" opacity="0.8"/>
    <circle cx="${sx}" cy="${sy}" r="3" fill="#00E5FF"/>
    <circle cx="${bx}" cy="${by}" r="3" fill="none" stroke="#EEF1F5" stroke-width="1.4"/>
  </svg>`;
}

function bar(label, v, weightPct) {
  return `<div class="xc-bar"><span class="xc-bar-l">${label} <em>${weightPct}%</em></span>
    <span class="xc-bar-t"><i style="width:${(v * 100).toFixed(0)}%"></i></span>
    <span class="xc-bar-v">${(v * 100).toFixed(0)}</span></div>`;
}

function card(m, spec, rank, buyerCity) {
  const L = m.lot, pct = Math.round(m.total * 100);
  const coverage = Math.min(100, Math.round((m.qty / spec.tons) * 100));
  const grade = `<span class="xc-grade xc-grade-${L.grade}">${L.grade}</span>`;
  return `<article class="xc-card">
    <div class="xc-card-top">
      <div class="xc-rank">#${rank}</div>
      <div class="xc-card-id">
        <div class="xc-card-city">${esc(m.sellerCity.name)}, ${esc(m.sellerCity.country)}</div>
        <div class="xc-card-sub">${L.polymer} · ${grade} · ${Math.round(L.confidence * 100)}% confidence · <span class="xc-hash">${esc(L.hash)}</span></div>
      </div>
      <div class="xc-score"><span class="xc-score-n">${pct}</span><span class="xc-score-u">match</span></div>
    </div>
    <div class="xc-metrics">
      <div><span>Available</span><b>${L.tons.toLocaleString('en-US')} t</b></div>
      <div><span>Price</span><b>${money(L.pricePerTon)}/t</b></div>
      <div><span>Landed</span><b>${money(m.landedPerTon)}/t</b></div>
      <div><span>Freight</span><b>${money(m.freightTotal)}</b></div>
      <div><span>Trucks</span><b>${m.trucks}</b></div>
      <div><span>Distance</span><b>${Math.round(m.distanceKm).toLocaleString('en-US')} km</b></div>
    </div>
    <div class="xc-card-bottom">
      <div class="xc-bars">
        ${bar('Spec fit', m.breakdown.specFit, 30)}
        ${bar('Landed cost', m.breakdown.landedCost, 35)}
        ${bar('Confidence', m.breakdown.confidence, 20)}
        ${bar('Distance', m.breakdown.distance, 15)}
      </div>
      <div class="xc-route">
        ${miniMap(m.sellerCity, buyerCity)}
        <div class="xc-route-meta">${esc(m.sellerCity.name)} → ${esc(buyerCity.name)}<br><span>covers ${coverage}% of ${spec.tons} t</span></div>
      </div>
    </div>
  </article>`;
}

function renderDemo() {
  const spec = readSpec();
  const buyerCity = CITIES_BY_ID[spec.cityId];
  const { matches, rejected } = rankLots(LOTS, spec, CITIES_BY_ID, FREIGHT_CONFIG);
  const summary = $('#matchSummary');
  const results = $('#matchResults');
  if (!matches.length) {
    summary.innerHTML = `<b>0</b> of ${LOTS.length} simulated lots meet this spec. Loosen a constraint — ${rejected.length ? 'try raising max PVC/price or lowering the minimum grade.' : ''}`;
    results.innerHTML = `<div class="xc-empty">No qualifying supply. The engine hard-filtered every lot on your constraints.</div>`;
    return;
  }
  const sumHtml = `<b>${matches.length}</b> of ${LOTS.length} simulated lots match · ranked by landed cost, spec fit, confidence &amp; distance · delivery to <b>${esc(buyerCity.name)}</b>`;
  if (summary.innerHTML !== sumHtml) summary.innerHTML = sumHtml; // avoid re-announcing the live region every slider tick
  results.innerHTML = matches.map((m, i) => card(m, spec, i + 1, buyerCity)).join('');
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
    syncLabels();
    renderDemo();
  });
  $('#specForm').addEventListener('submit', (e) => e.preventDefault());
  syncLabels();
  renderDemo();
}

/* ---------- waitlist forms ---------- */
function cityName(id) { return CITIES_BY_ID[id] ? `${CITIES_BY_ID[id].name}, ${CITIES_BY_ID[id].country}` : ''; }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function wireWaitlist(formId, side) {
  const form = $('#' + formId);
  if (!form) return;
  const errEl = $('[data-err]', form), sent = $('[data-sent]', form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const g = (n) => (form.querySelector(`[name="${n}"]`)?.value || '').trim();
    const emailEl = form.querySelector('input[name="email"]');
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
      source: 'exchange-' + side,
      email: g('email'), company: g('company'), location: city || g('company'),
      material: g('material'), throughput: g('monthlyTons') ? g('monthlyTons') + ' t/mo' : '',
      extra, website: g('website'),
    });
    btn.disabled = false; btn.textContent = label;
    if (!res.ok) { errEl.textContent = res.error || 'Something went wrong. Please try again.'; return; }
    form.querySelectorAll('.xc-field, .xc-submit').forEach((el) => { el.style.display = 'none'; });
    sent.hidden = false;
    sent.setAttribute('tabindex', '-1'); sent.focus();
  });
}

/* ---------- init ---------- */
function boot() {
  initNav();
  initReveal();
  initDemo();
  wireWaitlist('sellerForm', 'seller');
  wireWaitlist('buyerForm', 'buyer');
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
