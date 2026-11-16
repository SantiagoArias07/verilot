// VERILOT landing — bootstrap & choreography.
// Mounts the hero (WebGL with a 2D fallback), drives scroll-linked motion
// (exploded view, problem timeline, pipeline pulse, section reveals) and wires
// the interactive widgets (simulation, calculator, certificate, modal).
import { mountHero2D } from './hero2d.js';
import { initSimulation } from './sim.js';
import { initCalculator } from './calculator.js';
import { initModal } from './modal.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- hero headline word reveal ---------- */
function splitHeadline() {
  const h = $('#heroHeadline');
  if (!h) return;
  const words = h.textContent.trim().split(/\s+/);
  h.innerHTML = words.map((w, i) =>
    `<span class="hw"><span class="hwi" style="animation-delay:${(0.18 + i * 0.05).toFixed(2)}s">${w}</span></span>`
  ).join(' ');
  h.style.opacity = '1';
}

/* ---------- hero mount (3D → 2D fallback) ---------- */
async function mountHero() {
  const gl = $('#heroGL'), ov = $('#heroOverlay'), header = $('#top');
  const hud = { kgEl: $('#heroKg'), petEl: $('#heroPet'), batchEl: $('#heroBatch') };
  const ready = () => header && header.classList.add('hero-ready');
  const supportsWebGL = (() => {
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); }
    catch (e) { return false; }
  })();
  if (gl && ov && supportsWebGL) {
    try {
      const m = await import('./hero3d.js');
      await m.mountHero(gl, ov, { accent: '#00E5FF', speed: 1, ...hud, onReady: ready });
      return;
    } catch (e) {
      console.warn('[verilot] 3D hero unavailable, using 2D fallback:', e);
    }
  }
  // 2D fallback paints into the overlay canvas; hide the empty WebGL canvas so
  // it can never stack over the 2D art.
  if (gl) gl.style.display = 'none';
  mountHero2D(ov, hud);
  ready();
}

/* ---------- exploded view: scroll separation + click-to-isolate ---------- */
const COMPONENTS = {
  1: { tag: '01 · Vision', title: 'High-speed machine vision', desc: 'Flags visible contaminants and colorimetry: caps, labels, metal.' },
  2: { tag: '02 · NIR', title: 'NIR spectral sensor', desc: 'Identifies the exact polymer — PET, PP, HDPE — in milliseconds.' },
  3: { tag: '03 · Edge AI', title: 'Edge AI unit + connectivity', desc: 'Processes on-site, offline-tolerant; syncs over Wi-Fi or LTE.' },
  4: { tag: '04 · IP65', title: 'IP65 industrial chassis', desc: 'Sealed, air-purged optics against dust, grease and vibration.' },
  5: { tag: '05 · Light', title: 'Controlled illumination', desc: 'Constant light so every reading is directly comparable.' },
  6: { tag: '06 · Scale', title: 'In-line belt scale', desc: 'Weighs material in motion to close each batch precisely.' },
};

function initHardware() {
  const section = $('#hardware'), sticky = $('#hwSticky');
  if (!section || !sticky) return;
  // scroll-driven separation (--p ∈ 0..1)
  const onScroll = () => {
    const r = section.getBoundingClientRect(), tot = Math.max(1, r.height - window.innerHeight);
    let p = Math.min(1, Math.max(0, -r.top / tot));
    p = Math.min(1, Math.max(0, (p - 0.1) / 0.75));
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    sticky.style.setProperty('--p', e.toFixed(4));
  };
  document.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onScroll);
  onScroll();

  // click / hover isolation
  const rows = $$('.hw-row'), layers = $$('.hw-layer');
  const rowWrap = $('.hw-rows'), explodedWrap = $('.exploded'), callout = $('#explodedCallout');
  let locked = null;

  const apply = (comp) => {
    rows.forEach((r) => r.classList.toggle('is-active', +r.dataset.comp === comp));
    layers.forEach((l) => l.classList.toggle('is-active', +l.dataset.comp === comp));
    const on = comp != null;
    rowWrap.classList.toggle('has-active', on);
    explodedWrap.classList.toggle('has-active', on);
    if (on) {
      const c = COMPONENTS[comp];
      callout.innerHTML = `<div class="ec-tag">${c.tag}</div><div class="ec-title">${c.title}</div><div class="ec-desc">${c.desc}</div>`;
      callout.classList.add('show');
    } else {
      callout.classList.remove('show');
    }
  };

  const toggle = (comp) => { locked = locked === comp ? null : comp; apply(locked); };
  const bind = (el, keyboard) => {
    const comp = +el.dataset.comp;
    el.addEventListener('mouseenter', () => { if (locked == null) apply(comp); });
    el.addEventListener('mouseleave', () => { if (locked == null) apply(null); });
    el.addEventListener('click', () => toggle(comp));
    if (keyboard) {
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.setAttribute('aria-label', `${COMPONENTS[comp].title} — isolate component`);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(comp); }
      });
      el.addEventListener('focus', () => { if (locked == null) apply(comp); });
      el.addEventListener('blur', () => { if (locked == null) apply(null); });
    }
  };
  rows.forEach((r) => bind(r, true)); layers.forEach((l) => bind(l, false));
  document.addEventListener('click', (e) => {
    if (locked != null && !e.target.closest('.hw-row') && !e.target.closest('.hw-layer')) { locked = null; apply(null); }
  });
}

/* ---------- problem timeline + pipeline pulse + section reveals ---------- */
function initScrollFX() {
  if (!('IntersectionObserver' in window)) {
    $$('[data-reveal]').forEach((s) => s.classList.add('in'));
    $$('.problem-step').forEach((s) => s.classList.add('is-active'));
    $('.pipeline') && $('.pipeline').classList.add('is-live');
    return;
  }
  const revObs = new IntersectionObserver((ents) => {
    ents.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); revObs.unobserve(en.target); } });
  }, { threshold: 0.12 });
  $$('[data-reveal]').forEach((s) => revObs.observe(s));

  // progressive highlight along the 4-step problem timeline
  const steps = $$('.problem-step');
  const stepObs = new IntersectionObserver((ents) => {
    ents.forEach((en) => {
      if (en.isIntersecting) {
        const i = steps.indexOf(en.target);
        setTimeout(() => en.target.classList.add('is-active'), reduced ? 0 : i * 140);
        stepObs.unobserve(en.target);
      }
    });
  }, { threshold: 0.5 });
  steps.forEach((s) => stepObs.observe(s));

  // optical data pulse across the 5-step pipeline while it's on screen
  const pipeline = $('.pipeline');
  if (pipeline) {
    const pipeObs = new IntersectionObserver((ents) => {
      ents.forEach((en) => en.target.classList.toggle('is-live', en.isIntersecting));
    }, { threshold: 0.25 });
    pipeObs.observe(pipeline);
  }
}

/* ---------- simulation wiring ---------- */
function initSim() {
  const els = {
    simL: $('#simL'), simR: $('#simR'), nirWave: $('#nirWave'), qrSmall: $('#qrSmall'), qrBig: $('#qrBig'),
    alertList: $('#alertList'), leftCount: $('#leftCount'),
    ppDot: $('#ppDot'), ppTag: $('#ppTag'), ppStatus: $('#ppStatus'), ppGrade: $('#ppGrade'),
    ppPet: $('#ppPet'), ppBar: $('#ppBar'), ppConf: $('#ppConf'), ppHash: $('#ppHash'),
  };
  if (!els.simR) return;
  const sim = initSimulation(els);
  $('#simInject') && $('#simInject').addEventListener('click', sim.inject);
  $('#simReset') && $('#simReset').addEventListener('click', sim.reset);
}

/* ---------- certificate: verify hash + print + inspect ---------- */
function initCertificate() {
  const card = $('#certCard'), verify = $('#certVerify'), verifyBtn = $('#verifyHashBtn'), printBtn = $('#printCertBtn');
  if (verifyBtn && verify) {
    const META = [
      'sensor.nir.integration = 12ms · 410 reads',
      'vision.frames = 3,120 · 1596×1155 px',
      'belt.scale.kg = 850.0 ± 0.4',
      'model.rev = vl-polymer-4.2 · edge',
      'merkle.root = 7f3a9c…c91e4d',
      'sig.ok = true · lab-audit 1/20',
    ];
    verifyBtn.addEventListener('click', () => {
      const open = verify.style.display === 'flex';
      if (open) { verify.style.display = 'none'; verifyBtn.textContent = 'Verify Cryptographic Hash'; return; }
      verify.innerHTML = '<span style="color:var(--acc)">✓ Hash valid — telemetry consistent</span>' + META.map((m) => `<span>${m}</span>`).join('');
      verify.style.display = 'flex';
      verifyBtn.textContent = 'Hide Verification';
    });
  }
  if (printBtn) printBtn.addEventListener('click', () => window.print());

  $$('[data-inspect-cert]').forEach((btn) => btn.addEventListener('click', (e) => {
    e.preventDefault();
    const sec = $('#certificate');
    sec && sec.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
    if (card) { card.classList.remove('ping'); void card.offsetWidth; card.classList.add('ping'); }
  }));
}

/* ---------- deployment form (inline, in #deploy) ---------- */
function initDeployForm() {
  const form = $('#deployForm'), sent = $('#deploySent');
  if (!form || !sent) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    let ok = true;
    $$('input[required], select[required]', form).forEach((f) => {
      const valid = f.type === 'email' ? /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.value) : f.value.trim().length > 0;
      f.classList.toggle('invalid', !valid);
      if (!valid) ok = false;
    });
    if (!ok) return;
    form.style.display = 'none';
    sent.style.display = 'flex';
    sent.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
  });
}

/* ---------- mobile nav menu ---------- */
function initNav() {
  const burger = $('#navBurger'), menu = $('#navMenu');
  if (!burger || !menu) return;
  const setOpen = (o) => { burger.setAttribute('aria-expanded', String(o)); menu.classList.toggle('open', o); };
  burger.addEventListener('click', (e) => { e.stopPropagation(); setOpen(burger.getAttribute('aria-expanded') !== 'true'); });
  menu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setOpen(false)));
  document.addEventListener('click', (e) => { if (!e.target.closest('nav')) setOpen(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
}

/* ---------- init ---------- */
function boot() {
  initNav();
  splitHeadline();
  mountHero();
  initHardware();
  initScrollFX();
  initSim();
  initCalculator();
  initCertificate();
  initDeployForm();
  initModal();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
