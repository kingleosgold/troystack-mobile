// Reads a /v1/prices reply into what the app keeps. A metal counts only when
// its price clears a floor no real spot price falls under. A reply where no
// metal clears its floor returns null, so the app treats it as a failed fetch:
// it keeps its saved prices and doesn't call them live or move their time.
// A metal that fails its floor gets no day change, so nothing quotes a change
// that came with a price the app threw out.

export const SPOT_METALS = ['silver', 'gold', 'platinum', 'palladium'];

export const SPOT_FLOORS = { silver: 10, gold: 1000, platinum: 100, palladium: 100 };

const NO_CHANGE = { amount: null, percent: null, prevClose: null };

const toNum = (v) => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') return Number(v);
  return NaN;
};

// Day change from change_pct on a yesterday-close basis. A missing change_pct
// reads as flat, as before. One at or under -100% can't come from a real
// close, so it reads as flat too rather than dividing by zero or less.
const dayChange = (price, rawPct) => {
  const n = toNum(rawPct);
  const pct = Number.isFinite(n) && n > -100 ? n : 0;
  const prevClose = pct !== 0 ? price / (1 + pct / 100) : price;
  return { amount: price - prevClose, percent: pct, prevClose };
};

export const readSpotReply = (raw) => {
  const prices = raw && typeof raw === 'object' ? raw.prices : null;
  if (!prices || typeof prices !== 'object') return null;
  const spots = {};
  const liveMetals = {};
  const change = {};
  for (const metal of SPOT_METALS) {
    const data = prices[metal];
    const price = toNum(data && typeof data === 'object' ? data.price : undefined);
    const ok = Number.isFinite(price) && price > SPOT_FLOORS[metal];
    liveMetals[metal] = ok;
    if (ok) {
      spots[metal] = price;
      change[metal] = dayChange(price, data.change_pct);
    } else {
      change[metal] = { ...NO_CHANGE };
    }
  }
  if (!SPOT_METALS.some((m) => liveMetals[m])) return null;
  return { spots, liveMetals, change };
};
