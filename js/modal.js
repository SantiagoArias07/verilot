// Deployment Assessment — a dark-glass, multi-step modal opened by every primary
// CTA. Collects Facility Location, Monthly Tonnage, Polymer Stream and Work Email
// with per-step validation, then shows a professional confirmation receipt.
const STEPS = [
  { key: 'location', q: 'Where is the facility?', sub: 'City and country of the plant that will host the module.', type: 'text', placeholder: 'Monterrey, Mexico' },
  { key: 'tonnage', q: 'Monthly tonnage', sub: 'Approximate certified flake output per month.', type: 'choice', options: ['Under 100 t', '100–500 t', '500–1,500 t', 'Over 1,500 t'] },
  { key: 'polymer', q: 'Primary polymer stream', sub: 'The material you want certified first.', type: 'choice', options: ['Clear PET', 'Light PP', 'HDPE', 'Mixed rigids'] },
  { key: 'email', q: 'Work email', sub: 'We send the deployment assessment and next steps here.', type: 'email', placeholder: 'you@company.com' },
];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function initModal() {
  const root = document.getElementById('modalRoot');
  if (!root) return;
  let idx = 0, tier = '';
  const data = {};
  let lastFocus = null;

  function refId() {
    const a = Date.now().toString(36).toUpperCase().slice(-5);
    const b = Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, '0');
    return `VL-${a}-${b}`;
  }

  function valid(step) {
    const v = data[step.key];
    if (!v) return false;
    if (step.type === 'email') return EMAIL_RE.test(v);
    if (step.type === 'text') return v.trim().length >= 2;
    return true; // choice
  }

  function render() {
    const progress = STEPS.map((_, i) =>
      `<span class="${i < idx ? 'done' : i === idx ? 'active' : ''}"><i></i></span>`).join('');
    const steps = STEPS.map((s, i) => {
      let body = '';
      if (s.type === 'choice') {
        body = `<div class="modal-choices">${s.options.map((o) =>
          `<button type="button" class="modal-choice${data[s.key] === o ? ' sel' : ''}" data-choice="${o}">${o}</button>`).join('')}</div>`;
      } else {
        body = `<input class="modal-field" type="${s.type === 'email' ? 'email' : 'text'}" inputmode="${s.type === 'email' ? 'email' : 'text'}" placeholder="${s.placeholder}" value="${data[s.key] ? String(data[s.key]).replace(/"/g, '&quot;') : ''}" aria-label="${s.q}">`;
      }
      return `<div class="modal-step${i === idx ? ' active' : ''}" data-step="${i}">
        <div class="modal-q">${s.q}</div>
        <div class="modal-sub">${s.sub}</div>
        ${body}
        <div class="modal-err"></div>
      </div>`;
    }).join('');

    root.innerHTML = `
      <div class="modal-backdrop" data-close></div>
      <div class="modal-dialog" role="dialog" aria-modal="true" aria-label="Deployment assessment">
        <div class="modal-head">
          <div>
            <div class="modal-eyebrow">Deployment assessment${tier ? ` · ${tier}` : ''}</div>
            <h3 class="modal-title">Let’s scope your first module.</h3>
          </div>
          <button type="button" class="modal-close" data-close aria-label="Close">×</button>
        </div>
        <div class="modal-progress">${progress}</div>
        <div class="modal-body">${steps}</div>
        <div class="modal-actions">
          <button type="button" class="modal-btn modal-btn-ghost" data-back${idx === 0 ? ' style="visibility:hidden"' : ''}>Back</button>
          <button type="button" class="modal-btn" data-next>${idx === STEPS.length - 1 ? 'Submit request' : 'Continue'}</button>
        </div>
      </div>`;
    wireStep();
  }

  function wireStep() {
    const step = STEPS[idx];
    const dialog = root.querySelector('.modal-dialog');
    root.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    const field = root.querySelector('.modal-step.active .modal-field');
    const err = root.querySelector('.modal-step.active .modal-err');
    const next = root.querySelector('[data-next]');
    const back = root.querySelector('[data-back]');

    if (field) {
      field.addEventListener('input', () => { data[step.key] = field.value; field.classList.remove('invalid'); err.textContent = ''; });
      field.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); advance(); } });
      setTimeout(() => field.focus(), 60);
    }
    root.querySelectorAll('.modal-step.active .modal-choice').forEach((b) => {
      b.addEventListener('click', () => {
        data[step.key] = b.dataset.choice;
        root.querySelectorAll('.modal-step.active .modal-choice').forEach((x) => x.classList.remove('sel'));
        b.classList.add('sel');
        err.textContent = '';
      });
    });
    if (back) back.addEventListener('click', () => { if (idx > 0) { idx--; render(); } });
    if (next) next.addEventListener('click', advance);
    if (dialog) dialog.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'Tab') trapTab(e, dialog);
    });
  }

  function trapTab(e, dialog) {
    const nodes = dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const list = Array.from(nodes).filter((el) => !el.disabled && el.offsetParent !== null);
    if (!list.length) return;
    const first = list[0], last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function advance() {
    const step = STEPS[idx];
    const err = root.querySelector('.modal-step.active .modal-err');
    const field = root.querySelector('.modal-step.active .modal-field');
    if (!valid(step)) {
      if (field) field.classList.add('invalid');
      err.textContent = step.type === 'email' ? 'Enter a valid work email.' : step.type === 'text' ? 'This field is required.' : 'Select one option to continue.';
      return;
    }
    if (idx < STEPS.length - 1) { idx++; render(); }
    else submit();
  }

  function submit() {
    const ref = refId();
    root.querySelector('.modal-body').innerHTML = `
      <div class="modal-receipt">
        <div class="check">✓</div>
        <div style="font-size:22px; font-weight:500; letter-spacing:-0.02em;">Assessment received.</div>
        <div style="font-size:14.5px; color:#9BA3AF; line-height:1.55; max-width:360px;">A deployment engineer will review your facility and reach out within 48 hours with a tailored installation plan.</div>
        <div class="modal-receipt-meta">
          <div>REF · <b>${ref}</b></div>
          <div>Facility · <b>${esc(data.location)}</b></div>
          <div>Tonnage · <b>${esc(data.tonnage)}</b></div>
          <div>Polymer · <b>${esc(data.polymer)}</b></div>
          <div>Contact · <b>${esc(data.email)}</b></div>
          <div>Status · <b style="color:var(--acc)">Queued for review</b></div>
        </div>
      </div>`;
    root.querySelector('.modal-progress').querySelectorAll('span').forEach((s) => s.classList.add('done'));
    const actions = root.querySelector('.modal-actions');
    actions.innerHTML = `<span></span><button type="button" class="modal-btn" data-close>Done</button>`;
    actions.querySelector('[data-close]').addEventListener('click', close);
  }

  function esc(s) { return String(s || '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])); }

  function open(e) {
    const trigger = e.currentTarget;
    tier = (trigger && trigger.dataset && trigger.dataset.tier) || '';
    idx = 0;
    for (const k in data) delete data[k];
    lastFocus = document.activeElement;
    render();
    root.classList.add('open');
    root.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    document.getElementById('app')?.setAttribute('inert', ''); // background untabbable + a11y-hidden
  }
  function close() {
    root.classList.remove('open');
    root.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    document.getElementById('app')?.removeAttribute('inert');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  document.querySelectorAll('[data-open-modal]').forEach((btn) => btn.addEventListener('click', open));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && root.classList.contains('open')) close(); });
}
