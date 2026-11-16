// VERILOT Exchange — matching engine (pure functions, no DOM, no data).
// Everything here is deterministic and side-effect free so a future backend
// (Node / serverless / Postgres function) can reuse it unchanged. The browser
// demo and the `node --test` suite both import these same functions.
//
// Data shapes (plain objects):
//   City  : { id, name, country, region: 'MX'|'US'|'EU'|'ASIA', lat, lng }
//   Lot   : { id, cityId, polymer: 'PET'|'PP', grade: 'A'|'B'|'C',
//             confidence: 0..1, tons, pricePerTon, pvcPpm, moisturePct, hash }
//   Spec  : { polymer, minGrade: 'A'|'B'|'C', maxPvcPpm, maxMoisturePct,
//             tons, cityId, maxPricePerTon }
//   citiesById : { [id]: City }   — passed in, so this module imports no data.

// ---- configuration (documented; a backend can override per region/market) ----

// Freight rate in USD per ton·km, keyed by the SELLER (origin) region. These are
// illustrative first-order numbers for a preview, not quoted carrier rates.
export const FREIGHT_CONFIG = {
  ratePerTonKm: { default: 0.12, MX: 0.10, US: 0.11, EU: 0.14, ASIA: 0.13 },
  truckCapacityTons: 22, // standard bulk-bag truckload
};

// Score weights — must sum to 1. Rationale:
//  landedCost (0.35) dominates a real buying decision; specFit (0.30) is the
//  reason to buy at all; confidence (0.20) is the trust the certificate adds;
//  distance (0.15) is a secondary proxy for lead time / consolidation (freight
//  cost is already captured inside landedCost).
export const WEIGHTS = { specFit: 0.30, landedCost: 0.35, confidence: 0.20, distance: 0.15 };

// Normalisation bounds.
export const SCORE_BOUNDS = {
  maxDistanceKm: 13000, // beyond this, distance score floors at 0
};

const GRADE = { A: 3, B: 2, C: 1 };
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const toRad = (d) => (d * Math.PI) / 180;

export function gradeToNum(g) { return GRADE[String(g).toUpperCase()] ?? 0; }

// Great-circle distance in km between { lat, lng } points (Haversine, R=6371km).
export function haversineKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function trucksNeeded(tons, cfg = FREIGHT_CONFIG) {
  return Math.max(0, Math.ceil(tons / cfg.truckCapacityTons));
}

// Freight for moving the deal quantity (= min of lot availability and demand).
export function freight(lot, spec, sellerCity, buyerCity, cfg = FREIGHT_CONFIG) {
  const qty = Math.max(0, Math.min(lot.tons, spec.tons));
  const km = haversineKm(sellerCity, buyerCity);
  const ratePerTonKm = cfg.ratePerTonKm[sellerCity.region] ?? cfg.ratePerTonKm.default;
  const total = km * ratePerTonKm * qty;
  const perTon = km * ratePerTonKm; // total / qty, independent of qty
  return { qty, km, ratePerTonKm, total, perTon, trucks: trucksNeeded(qty, cfg) };
}

// Hard constraints the buyer set. A lot either qualifies or it doesn't.
export function hardFilter(lot, spec) {
  const reasons = [];
  if (lot.polymer !== spec.polymer) reasons.push('polymer');
  if (gradeToNum(lot.grade) < gradeToNum(spec.minGrade)) reasons.push('grade');
  if (lot.pvcPpm > spec.maxPvcPpm) reasons.push('pvc');
  if (lot.moisturePct > spec.maxMoisturePct) reasons.push('moisture');
  if (lot.pricePerTon > spec.maxPricePerTon) reasons.push('price');
  if (!(lot.tons > 0)) reasons.push('availability'); // sold-out / zero-qty lots can't fill an order
  return { pass: reasons.length === 0, reasons };
}

// Soft score in [0,1] for a qualifying lot, with a transparent breakdown.
export function scoreLot(lot, spec, sellerCity, buyerCity, cfg = FREIGHT_CONFIG) {
  const fr = freight(lot, spec, sellerCity, buyerCity, cfg);
  const landedPerTon = lot.pricePerTon + fr.perTon;

  // specFit: higher grade + more headroom under the PVC / moisture caps.
  const gradeScore = gradeToNum(lot.grade) / 3;
  const pvcScore = spec.maxPvcPpm > 0 ? clamp(1 - lot.pvcPpm / spec.maxPvcPpm) : 1;
  const moistScore = spec.maxMoisturePct > 0 ? clamp(1 - lot.moisturePct / spec.maxMoisturePct) : 1;
  const specFit = (gradeScore + pvcScore + moistScore) / 3;

  // landedCost: landed price vs the buyer's budget. Half budget → 1, budget →
  // 0.5, 1.5× budget → 0. (Freight can push an otherwise-cheap lot over budget.)
  const ref = Math.max(1, spec.maxPricePerTon);
  const landedCost = clamp(1 - (landedPerTon - ref * 0.5) / ref);

  // distance: closer is better (lead time / consolidation), freight aside.
  const distance = clamp(1 - fr.km / SCORE_BOUNDS.maxDistanceKm);

  // confidence: the certificate's own confidence level.
  const confidence = clamp(lot.confidence);

  const breakdown = { specFit, landedCost, confidence, distance };
  const weighted = {
    specFit: WEIGHTS.specFit * specFit,
    landedCost: WEIGHTS.landedCost * landedCost,
    confidence: WEIGHTS.confidence * confidence,
    distance: WEIGHTS.distance * distance,
  };
  const total = weighted.specFit + weighted.landedCost + weighted.confidence + weighted.distance;

  return {
    total, breakdown, weighted,
    distanceKm: fr.km, freightTotal: fr.total, freightPerTon: fr.perTon,
    landedPerTon, trucks: fr.trucks, qty: fr.qty,
  };
}

// Full pipeline: hard filter → score → rank. `citiesById` maps city id → City.
// Returns { matches, rejected }. `matches` is sorted best-first.
export function rankLots(lots, spec, citiesById, cfg = FREIGHT_CONFIG) {
  const buyerCity = citiesById[spec.cityId];
  if (!buyerCity) throw new Error(`unknown delivery city: ${spec.cityId}`);
  const matches = [];
  const rejected = [];
  for (const lot of lots) {
    const sellerCity = citiesById[lot.cityId];
    if (!sellerCity) continue;
    const hf = hardFilter(lot, spec);
    if (!hf.pass) { rejected.push({ lot, reasons: hf.reasons }); continue; }
    const s = scoreLot(lot, spec, sellerCity, buyerCity, cfg);
    matches.push({ lot, sellerCity, ...s });
  }
  matches.sort((a, b) => b.total - a.total);
  return { matches, rejected };
}
