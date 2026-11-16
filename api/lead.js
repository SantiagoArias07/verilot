// Vercel Node serverless function (no framework, no build step).
// Validates a deployment-assessment lead, blocks bots with a honeypot + a
// per-IP in-memory rate limit, and emails it through the Resend REST API.
//
// Required env vars (set in Vercel → Project → Settings → Environment Variables):
//   RESEND_API_KEY   — a Resend API key (https://resend.com/api-keys)
//   LEAD_TO_EMAIL    — the inbox that should receive leads

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;
const hits = new Map(); // ip -> number[]  (warm-instance memory; fine per spec)

function rateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) { // opportunistic cleanup
    for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  }
  return arr.length > MAX_PER_WINDOW;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clean = (s, max = 200) => String(s == null ? '' : s).trim().slice(0, max);
const esc = (s) => clean(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return await new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => { d += c; if (d.length > 10_000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

function send(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'Method not allowed' });

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.socket?.remoteAddress || 'unknown';
  if (rateLimited(ip)) return send(res, 429, { ok: false, error: 'Too many requests. Please try again shortly.' });

  const body = await readBody(req);

  // honeypot — real users never fill this; pretend success so bots don't retry
  if (clean(body.website)) return send(res, 200, { ok: true });

  const lead = {
    name: clean(body.name, 120),
    company: clean(body.company, 160),
    location: clean(body.location, 160),
    email: clean(body.email, 160),
    material: clean(body.material, 80),
    throughput: clean(body.throughput, 80),
    source: clean(body.source, 40) || 'modal',
  };

  const fields = [];
  if (!EMAIL_RE.test(lead.email)) fields.push('email');
  if (!lead.name && !lead.company && !lead.location) fields.push('identity');
  if (fields.length) return send(res, 400, { ok: false, error: 'Please complete the required fields.', fields });

  const KEY = process.env.RESEND_API_KEY, TO = process.env.LEAD_TO_EMAIL;
  if (!KEY || !TO) {
    console.error('[lead] missing RESEND_API_KEY or LEAD_TO_EMAIL');
    return send(res, 503, { ok: false, error: 'Email service is not configured yet.' });
  }

  // optional structured extras (e.g. Exchange waitlist fields) — label → value
  const extra = (body.extra && typeof body.extra === 'object' && !Array.isArray(body.extra)) ? body.extra : {};
  const extraPairs = Object.entries(extra).slice(0, 12)
    .map(([k, v]) => [clean(k, 60), clean(v, 200)]).filter(([k, v]) => k && v);

  const rows = [
    ['Source', lead.source], ['Name', lead.name], ['Company / facility', lead.company],
    ['Location', lead.location], ['Email', lead.email], ['Material', lead.material],
    ['Throughput', lead.throughput], ...extraPairs, ['IP', ip],
  ].filter(([, v]) => v).map(([k, v]) => `<tr><td style="padding:4px 10px"><b>${esc(k)}</b></td><td style="padding:4px 10px">${esc(v)}</td></tr>`).join('');
  const html = `<h2 style="font-family:system-ui">New VERILOT lead</h2><table style="font-family:ui-monospace,monospace;border-collapse:collapse">${rows}</table>`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'VERILOT <onboarding@resend.dev>',
        to: [TO],
        reply_to: lead.email,
        subject: `VERILOT lead · ${lead.company || lead.location || lead.name} (${lead.source})`,
        html,
      }),
    });
    if (!r.ok) {
      console.error('[lead] resend error', r.status, await r.text().catch(() => ''));
      return send(res, 502, { ok: false, error: 'Could not send right now. Please try again.' });
    }
  } catch (e) {
    console.error('[lead] fetch failed', e);
    return send(res, 502, { ok: false, error: 'Could not send right now. Please try again.' });
  }

  return send(res, 200, { ok: true });
}
