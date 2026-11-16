// Unit tests for the Exchange matching engine. Run: `node --test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  haversineKm, gradeToNum, trucksNeeded, freight, hardFilter, scoreLot, rankLots,
  WEIGHTS, FREIGHT_CONFIG,
} from '../js/match.js';
import { LOTS, CITIES_BY_ID } from '../js/exchange-data.js';

const CITIES = {
  mty: { id: 'mty', region: 'MX', lat: 25.6866, lng: -100.3161 },
  hou: { id: 'hou', region: 'US', lat: 29.7604, lng: -95.3698 },
};
const lot = (o = {}) => ({
  id: 'L1', cityId: 'mty', polymer: 'PET', grade: 'A', confidence: 0.95,
  tons: 500, pricePerTon: 900, pvcPpm: 20, moisturePct: 0.5, hash: 'aaaa…bbbb', ...o,
});
const spec = (o = {}) => ({
  polymer: 'PET', minGrade: 'B', maxPvcPpm: 250, maxMoisturePct: 3,
  tons: 300, cityId: 'hou', maxPricePerTon: 1000, ...o,
});

test('haversineKm: zero, symmetry, plausible magnitude', () => {
  assert.equal(haversineKm(CITIES.mty, CITIES.mty), 0);
  const ab = haversineKm(CITIES.mty, CITIES.hou);
  const ba = haversineKm(CITIES.hou, CITIES.mty);
  assert.ok(Math.abs(ab - ba) < 1e-9, 'symmetric');
  assert.ok(ab > 600 && ab < 900, `MTY→HOU ~750km, got ${ab.toFixed(0)}`);
});

test('gradeToNum', () => {
  assert.equal(gradeToNum('A'), 3);
  assert.equal(gradeToNum('b'), 2);
  assert.equal(gradeToNum('C'), 1);
  assert.equal(gradeToNum('Z'), 0);
});

test('trucksNeeded: ceil over 22t capacity', () => {
  assert.equal(trucksNeeded(0), 0);
  assert.equal(trucksNeeded(22), 1);
  assert.equal(trucksNeeded(23), 2);
  assert.equal(trucksNeeded(44), 2);
  assert.equal(trucksNeeded(45), 3);
});

test('freight: qty = min(availability, demand); perTon = km*rate', () => {
  const f = freight(lot({ tons: 500 }), spec({ tons: 300 }), CITIES.mty, CITIES.hou);
  assert.equal(f.qty, 300, 'limited by demand');
  const rate = FREIGHT_CONFIG.ratePerTonKm.MX; // seller region
  assert.ok(Math.abs(f.perTon - f.km * rate) < 1e-9);
  assert.ok(Math.abs(f.total - f.perTon * f.qty) < 1e-6);
  assert.equal(f.trucks, Math.ceil(300 / 22));

  const f2 = freight(lot({ tons: 100 }), spec({ tons: 300 }), CITIES.mty, CITIES.hou);
  assert.equal(f2.qty, 100, 'limited by lot availability');
});

test('hardFilter: passes a compliant lot, flags each violated constraint', () => {
  assert.deepEqual(hardFilter(lot(), spec()), { pass: true, reasons: [] });
  assert.deepEqual(hardFilter(lot({ polymer: 'PP' }), spec()).reasons, ['polymer']);
  assert.deepEqual(hardFilter(lot({ grade: 'C' }), spec({ minGrade: 'B' })).reasons, ['grade']);
  assert.deepEqual(hardFilter(lot({ pvcPpm: 999 }), spec()).reasons, ['pvc']);
  assert.deepEqual(hardFilter(lot({ moisturePct: 9 }), spec()).reasons, ['moisture']);
  assert.deepEqual(hardFilter(lot({ pricePerTon: 5000 }), spec()).reasons, ['price']);
  assert.deepEqual(hardFilter(lot({ tons: 0 }), spec()).reasons, ['availability']);
  assert.equal(hardFilter(lot({ polymer: 'PP', grade: 'C' }), spec()).reasons.length, 2);
});

test('scoreLot: stays finite & in range at degenerate limits (0 caps, over-unit confidence, 0 budget)', () => {
  const s = scoreLot(lot({ confidence: 1.5 }), spec({ maxPvcPpm: 0, maxMoisturePct: 0, maxPricePerTon: 0 }), CITIES.mty, CITIES.hou);
  for (const k of ['specFit', 'landedCost', 'confidence', 'distance']) {
    assert.ok(Number.isFinite(s.breakdown[k]) && s.breakdown[k] >= 0 && s.breakdown[k] <= 1, `${k} finite in [0,1]`);
  }
  assert.equal(s.breakdown.confidence, 1, 'confidence clamps to 1');
  assert.ok(Number.isFinite(s.total) && s.total >= 0 && s.total <= 1);
});

test('rankLots: silently skips lots whose cityId is unknown', () => {
  const lots = [lot({ id: 'ok', cityId: 'mty' }), lot({ id: 'ghost', cityId: 'atlantis' })];
  const coords = { mty: CITIES.mty, hou: CITIES.hou };
  const { matches } = rankLots(lots, spec(), coords);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].lot.id, 'ok');
});

test('scoreLot: components in [0,1] and total equals weighted sum', () => {
  const s = scoreLot(lot(), spec(), CITIES.mty, CITIES.hou);
  for (const k of ['specFit', 'landedCost', 'confidence', 'distance']) {
    assert.ok(s.breakdown[k] >= 0 && s.breakdown[k] <= 1, `${k} in range`);
  }
  assert.ok(s.total >= 0 && s.total <= 1);
  const sum = WEIGHTS.specFit * s.breakdown.specFit + WEIGHTS.landedCost * s.breakdown.landedCost
    + WEIGHTS.confidence * s.breakdown.confidence + WEIGHTS.distance * s.breakdown.distance;
  assert.ok(Math.abs(s.total - sum) < 1e-9);
  assert.ok(Math.abs(s.landedPerTon - (lot().pricePerTon + s.freightPerTon)) < 1e-9);
});

test('scoreLot: a cleaner, cheaper, closer, higher-confidence lot scores higher', () => {
  const good = lot({ grade: 'A', pvcPpm: 10, moisturePct: 0.3, pricePerTon: 820, confidence: 0.98 });
  const worse = lot({ grade: 'B', pvcPpm: 160, moisturePct: 2.0, pricePerTon: 980, confidence: 0.90 });
  const sg = scoreLot(good, spec(), CITIES.mty, CITIES.hou);
  const sw = scoreLot(worse, spec(), CITIES.mty, CITIES.hou);
  assert.ok(sg.total > sw.total);
});

test('weights sum to 1', () => {
  const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test('rankLots: only qualifying lots, sorted best-first', () => {
  const { matches, rejected } = rankLots(LOTS, spec({ polymer: 'PET', minGrade: 'B' }), CITIES_BY_ID);
  assert.ok(matches.length > 0);
  for (const m of matches) {
    assert.equal(m.lot.polymer, 'PET');
    assert.ok(gradeToNum(m.lot.grade) >= gradeToNum('B'));
    assert.equal(hardFilter(m.lot, spec({ polymer: 'PET', minGrade: 'B' })).pass, true);
  }
  for (let i = 1; i < matches.length; i++) assert.ok(matches[i - 1].total >= matches[i].total);
  for (const r of rejected) assert.ok(r.reasons.length > 0);
  assert.equal(matches.length + rejected.length, LOTS.length);
});

test('rankLots: minGrade A excludes B and C lots', () => {
  const { matches } = rankLots(LOTS, spec({ minGrade: 'A' }), CITIES_BY_ID);
  for (const m of matches) assert.equal(m.lot.grade, 'A');
});

test('rankLots: unknown delivery city throws', () => {
  assert.throws(() => rankLots(LOTS, spec({ cityId: 'nowhere' }), CITIES_BY_ID), /unknown delivery city/);
});
