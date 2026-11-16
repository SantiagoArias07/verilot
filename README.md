# VERILOT — Landing

The trust layer for circular manufacturing. An investor-grade Deep Tech product page:
Obsidian (`#08090C`) + Electric Cyan (`#00E5FF`), a cinematic WebGL hero (VERILOT M1
optical-sorting module), a live split-screen batch simulation, a digital batch passport,
a zero-CapEx recovery calculator and a global network map.

## Stack

Zero-build static site — plain HTML, CSS and ES modules. [Three.js](https://threejs.org)
is vendored locally (`vendor/three.module.js`, loaded via import map) so the 3D hero renders
with zero CDN latency and no flash of empty canvas. No framework, no bundler, no runtime
dependencies to install.

## Run locally

```bash
npm run dev        # serves the site at http://localhost:3000
# or any static server, e.g.:  python3 -m http.server 3000
```

Open `http://localhost:3000`.

## Deploy to Vercel

The repo is a static site at its root — zero configuration required.

```bash
npx vercel          # preview deploy
npx vercel --prod   # production deploy
```

Or import the repo in the Vercel dashboard. Framework preset: **Other** (no build step).
`vercel.json` adds long-cache headers for `vendor/` and security headers.

## Lead capture (serverless)

The deployment-assessment modal and the inline form POST to `api/lead.js`, a Vercel
Node function that validates the payload, blocks bots (honeypot + per-IP rate limit)
and emails the lead via the [Resend](https://resend.com) REST API.

Set two environment variables in **Vercel → Project → Settings → Environment Variables**
(Production + Preview), then redeploy:

| Variable | Value |
| --- | --- |
| `RESEND_API_KEY` | A Resend API key (`https://resend.com/api-keys`) |
| `LEAD_TO_EMAIL` | The inbox that should receive leads |

Until these are set, submissions return a clean "Email service is not configured yet"
error (the UI shows it; nothing is faked). The `from` address is `onboarding@resend.dev`
for now — swap it for a verified domain sender once DNS is set up.

## Performance

Desktop runs the full WebGL hero; **mobile (≤ 760px) shows a static render of the same
scene** (`assets/hero-poster.jpg`) and never downloads Three.js, keeping Lighthouse mobile
performance ≥ 90. `prefers-reduced-motion` renders a single static hero frame and freezes
the simulation and map.

## Structure

```
index.html            Full landing page (12 sections, nav, footer)
styles.css            Design tokens, component styles, responsive rules, animations
map.html              Standalone global network map (embedded via <iframe>)
js/
  main.js             Bootstrap: scroll choreography, state, CTA → modal wiring
  hero3d.js           Cinematic WebGL hero (VERILOT M1), zero-latency first frame
  hero2d.js           2D canvas fallback when WebGL is unavailable
  sim.js              Live split-screen simulation + NIR waveform + digital passport
  calculator.js       Zero-CapEx recovery calculator with animated number roll-ups
  modal.js            Multi-step Deployment Assessment modal + validation + receipt
  qr.js               Deterministic QR-style code renderer
vendor/
  three.module.js     Three.js r160 (vendored for offline / zero-latency)
```
