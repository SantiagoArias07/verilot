// Zero-CapEx recovery calculator — custom cyan sliders drive animated
// number roll-ups for monthly / annual / per-ton recoverable revenue.
const fmt = (n) => '$' + Math.round(n).toLocaleString('en-US');

function setFill(input) {
  const min = +input.min, max = +input.max, v = +input.value;
  const pct = ((v - min) / (max - min)) * 100;
  input.style.setProperty('--fill', pct.toFixed(2) + '%');
}

function roller(el) {
  let current = parseFloat((el.textContent || '0').replace(/[^0-9.]/g, '')) || 0;
  let raf = 0, from = current, to = current, start = 0;
  return (target) => {
    if (target === to) return;
    cancelAnimationFrame(raf);
    from = current; to = target; start = performance.now();
    el.classList.add('calc-roll', 'bump');
    const dur = 480;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / dur);
      const e = 1 - Math.pow(1 - p, 3); // easeOutCubic
      current = from + (to - from) * e;
      el.textContent = fmt(current);
      if (p < 1) raf = requestAnimationFrame(tick);
      else { current = to; el.textContent = fmt(to); el.classList.remove('bump'); }
    };
    raf = requestAnimationFrame(tick);
  };
}

export function initCalculator() {
  const rngTons = document.getElementById('rngTons');
  const rngPrice = document.getElementById('rngPrice');
  const rngPenalty = document.getElementById('rngPenalty');
  if (!rngTons || !rngPrice || !rngPenalty) return;

  const valTons = document.getElementById('valTons');
  const valPrice = document.getElementById('valPrice');
  const valPenalty = document.getElementById('valPenalty');
  const rollM = roller(document.getElementById('recM'));
  const rollY = roller(document.getElementById('recY'));
  const rollT = roller(document.getElementById('recT'));

  function recompute(animate) {
    const tons = +rngTons.value, price = +rngPrice.value, penalty = +rngPenalty.value;
    valTons.textContent = tons;
    valPrice.textContent = price;
    valPenalty.textContent = penalty;
    const m = tons * price * penalty / 100;
    if (animate) { rollM(m); rollY(m * 12); rollT(price * penalty / 100); }
    else {
      document.getElementById('recM').textContent = fmt(m);
      document.getElementById('recY').textContent = fmt(m * 12);
      document.getElementById('recT').textContent = fmt(price * penalty / 100);
    }
  }

  [rngTons, rngPrice, rngPenalty].forEach((r) => {
    setFill(r);
    r.addEventListener('input', () => { setFill(r); recompute(true); });
  });
  recompute(false);
}
