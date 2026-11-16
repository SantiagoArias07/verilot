# VERILOT Exchange — Architecture (from v0 preview to production)

This document describes how the static **Exchange v0** preview (in `exchange/` +
`js/match.js`, `js/exchange-data.js`) becomes a real product. The v0 goal is to
validate the *matching model* and *demand* with zero backend. Everything below is
the target for v1+, not what ships in the preview.

The core idea: VERILOT already certifies a recycled-plastic batch at the source.
The Exchange turns **every certificate into a listing**, lets **buyers post specs
(RFQs)**, and **matches + prices the freight** so buyers compare *landed cost*, not
sticker price. The matching logic in `js/match.js` is written as pure functions on
purpose so the production backend reuses it verbatim.

---

## 1. Target stack

| Layer | Choice | Why |
| --- | --- | --- |
| App | **Next.js (App Router) on Vercel** | Same host as the marketing site; SSR for the public `/verify/<hash>` pages (SEO + shareable), API routes for the engine. |
| DB | **Supabase Postgres + PostGIS** | Relational integrity for deals; PostGIS for city/route geography and distance; Row-Level Security for multi-tenant access. |
| Auth | **Supabase Auth** (email + SSO later) | Companies & users; RLS policies scope data per company. |
| Matching | **`match.js` ported to a shared package** (`@verilot/match`) | One implementation used by the browser preview, API routes and background jobs. |
| Payments | **Stripe Connect** (v2) | Marketplace payouts, escrow-style holds, platform fee on closed deals. |
| Freight | Pluggable `FreightProvider` interface | v1 = the `match.js` estimate; v2 = real carrier/broker quotes. |
| Jobs | Vercel Cron + Supabase Edge Functions | Re-rank open RFQs when new certificates land; expire stale quotes. |

The preview's `match.js` config (`FREIGHT_CONFIG`, `WEIGHTS`, `SCORE_BOUNDS`) moves
into DB-backed, per-market configuration so pricing can be tuned without a deploy.

---

## 2. Data model

Tables (PostGIS `geography(Point)` for locations). FKs omitted for brevity.

- **companies** — `id, name, type[seller|buyer|both], country, verified_at`
- **facilities** — `id, company_id, name, city, geo (Point), region`
- **certificates** — the source of truth, emitted by a VERILOT module:
  `id, hash (unique), facility_id, polymer, grade, confidence, net_mass_kg,
  pvc_ppm, moisture_pct, composition jsonb, evidence_uri, issued_at, lab_audit_ref`
- **listings** — a certificate offered for sale (auto-created on certificate close):
  `id, certificate_id, company_id, tons_available, price_per_ton, status[open|reserved|sold], expires_at`
- **buyer_specs / rfqs** — demand posted by a buyer:
  `id, company_id, polymer, min_grade, max_pvc_ppm, max_moisture_pct, tons,
  delivery_facility_id, max_price_per_ton, status[open|filled|closed]`
- **matches** — the scored result of (rfq × listing), persisted for auditability:
  `id, rfq_id, listing_id, total_score, breakdown jsonb, landed_per_ton,
  freight_total, distance_km, trucks, created_at`
- **freight_quotes** — `id, match_id, provider, amount, valid_until, legs jsonb`
- **deals** — `id, match_id, buyer_id, seller_id, tons, price_per_ton, freight_cost,
  status[proposed|accepted|in_transit|delivered|settled], stripe_payment_intent, timeline jsonb`

RLS: a company sees its own listings/RFQs/deals; `certificates` are readable by the
owner and, in redacted form, by matched counterparties; `/verify/<hash>` exposes a
**public, read-only** projection of a certificate.

---

## 3. Matching pipeline

Mirrors `js/match.js` (`hardFilter` → `scoreLot` → `rankLots`), run server-side:

1. **Candidate fetch** — open listings where `polymer = rfq.polymer` and
   `grade >= rfq.min_grade` (SQL/index prefilter).
2. **Hard filter** — `hardFilter(listing, rfq)`: polymer, grade, PVC, moisture, price.
3. **Freight** — `freight()`: `haversineKm × ratePerTonKm(region) × qty`,
   `qty = min(listing.tons, rfq.tons)`, `trucks = ceil(qty / 22)`. v2 swaps in a real
   `FreightProvider` quote.
4. **Score** — `scoreLot()`: weighted `specFit (30%) · landedCost (35%) ·
   confidence (20%) · distance (15%)`, all transparent and auditable (stored in
   `matches.breakdown`).
5. **Rank & persist** — sort by `total`, write `matches`, notify the buyer.
6. **Re-rank on supply** — a cron/edge job re-runs open RFQs when new certificates
   are listed, surfacing fresh matches.

Keeping the exact function signatures from `match.js` means the preview, the API and
the jobs can’t drift.

---

## 4. First real feature: public `/verify/<hash>`

Before any marketplace mechanics, ship the **public certificate verification page** —
it’s the trust primitive the whole Exchange rests on and is useful on its own.

- Route: `GET /verify/[hash]` (SSR). Looks up `certificates.hash`.
- Shows: polymer, grade, estimated composition, confidence, net mass, issuing
  facility + date, evidence thumbnails, lab-audit cadence, and a tamper check
  (recompute the hash from the signed payload → match/mismatch badge).
- A buyer who receives a batch (or a QR) can verify it with **no account**.
- This replaces the landing page's "sample certificate" with a real, shareable URL.

---

## 5. Phased roadmap

- **v0 — Preview (this repo).** Static `/exchange/` page: hero, how-it-works,
  interactive matching demo on simulated data (`match.js` + `exchange-data.js`),
  honest AI section, and seller/buyer **waitlist** forms posting to `api/lead.js`.
  No auth, no DB. Goal: validate the model + capture demand.
- **v1 — Verify + Listings + RFQs.** Next.js + Supabase. Public `/verify/<hash>`;
  certificates auto-create listings; buyers post RFQs; server-side matching with the
  ported engine; email alerts on new matches. Still no money movement.
- **v2 — Deals + logistics + payments.** Accept/counter a match → `deal`; real
  freight quotes via a `FreightProvider` (carrier/broker API); Stripe Connect for
  escrow-style holds and payouts; route consolidation across lots/buyers; LLM RFQ
  parsing and price prediction (the "Next" items from the AI section) behind
  feature flags, always with the deterministic engine as the auditable baseline.

---

## 6. Reusing the v0 engine

`js/match.js` is intentionally dependency-free and DOM-free:

- Extract it to a workspace package `@verilot/match` (same file, add types).
- Browser preview, Next.js API routes, and cron jobs all `import` it.
- `node --test` (`test/match.test.js`) becomes the package's test suite and the
  contract the backend must honor; add property-based tests for scoring monotonicity.
- DB-backed config replaces the hard-coded `FREIGHT_CONFIG` / `WEIGHTS` so markets
  can be tuned live; the function signatures stay fixed.
