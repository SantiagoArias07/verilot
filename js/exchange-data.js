// VERILOT Exchange — simulated data for the preview demo (not real inventory).
// Deterministic: the lots are generated from a fixed seed so the demo and the
// test suite always see the same values. Real industrial cities with lat/lng.

export const CITIES = [
  { id: 'mty', name: 'Monterrey', country: 'MX', region: 'MX', lat: 25.6866, lng: -100.3161 },
  { id: 'gdl', name: 'Guadalajara', country: 'MX', region: 'MX', lat: 20.6597, lng: -103.3496 },
  { id: 'mex', name: 'Mexico City', country: 'MX', region: 'MX', lat: 19.4326, lng: -99.1332 },
  { id: 'qro', name: 'Querétaro', country: 'MX', region: 'MX', lat: 20.5888, lng: -100.3899 },
  { id: 'hou', name: 'Houston', country: 'US', region: 'US', lat: 29.7604, lng: -95.3698 },
  { id: 'chi', name: 'Chicago', country: 'US', region: 'US', lat: 41.8781, lng: -87.6298 },
  { id: 'lax', name: 'Los Angeles', country: 'US', region: 'US', lat: 34.0522, lng: -118.2437 },
  { id: 'atl', name: 'Atlanta', country: 'US', region: 'US', lat: 33.7490, lng: -84.3880 },
  { id: 'rtm', name: 'Rotterdam', country: 'NL', region: 'EU', lat: 51.9244, lng: 4.4777 },
  { id: 'str', name: 'Stuttgart', country: 'DE', region: 'EU', lat: 48.7758, lng: 9.1829 },
  { id: 'mil', name: 'Milan', country: 'IT', region: 'EU', lat: 45.4642, lng: 9.1900 },
  { id: 'bcn', name: 'Barcelona', country: 'ES', region: 'EU', lat: 41.3874, lng: 2.1686 },
  { id: 'szx', name: 'Shenzhen', country: 'CN', region: 'ASIA', lat: 22.5431, lng: 114.0579 },
  { id: 'bkk', name: 'Bangkok', country: 'TH', region: 'ASIA', lat: 13.7563, lng: 100.5018 },
  { id: 'bom', name: 'Mumbai', country: 'IN', region: 'ASIA', lat: 19.0760, lng: 72.8777 },
  { id: 'osa', name: 'Osaka', country: 'JP', region: 'ASIA', lat: 34.6937, lng: 135.5023 },
];

export const CITIES_BY_ID = Object.fromEntries(CITIES.map((c) => [c.id, c]));

// deterministic PRNG (mulberry32)
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GRADE_SPEC = {
  A: { pvc: [2, 40], moist: [0.2, 0.8], conf: [0.93, 0.985], premium: 120 },
  B: { pvc: [40, 180], moist: [0.8, 2.2], conf: [0.90, 0.95], premium: 0 },
  C: { pvc: [180, 550], moist: [2.2, 5.0], conf: [0.86, 0.93], premium: -140 },
};
const BASE_PRICE = { PET: 820, PP: 680 };

function buildLots(n, seed) {
  const r = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const range = ([lo, hi]) => lo + r() * (hi - lo);
  const hex = () => Array.from({ length: 16 }, () => '0123456789abcdef'[Math.floor(r() * 16)]).join('');
  const gradeWeighted = ['A', 'A', 'A', 'B', 'B', 'B', 'C']; // skew to clean material
  const lots = [];
  for (let i = 0; i < n; i++) {
    const city = pick(CITIES);
    const polymer = r() < 0.58 ? 'PET' : 'PP';
    const grade = pick(gradeWeighted);
    const g = GRADE_SPEC[grade];
    const regionAdj = { MX: -30, US: 0, EU: 60, ASIA: -50 }[city.region] || 0;
    const price = Math.round((BASE_PRICE[polymer] + g.premium + regionAdj + (r() - 0.5) * 80) / 5) * 5;
    const h = hex();
    lots.push({
      id: `VL-${(1401 + i)}`,
      cityId: city.id,
      polymer,
      grade,
      confidence: +range(g.conf).toFixed(3),
      tons: Math.round(range([80, 1200]) / 10) * 10,
      pricePerTon: price,
      pvcPpm: Math.round(range(g.pvc)),
      moisturePct: +range(g.moist).toFixed(1),
      hash: `${h.slice(0, 4)}…${h.slice(-4)}`,
    });
  }
  return lots;
}

export const LOTS = buildLots(25, 20260316);

// a sensible default buyer spec for the demo's first render
export const DEFAULT_SPEC = {
  polymer: 'PET',
  minGrade: 'B',
  maxPvcPpm: 250,
  maxMoisturePct: 3,
  tons: 300,
  cityId: 'hou',
  maxPricePerTon: 1000,
};
