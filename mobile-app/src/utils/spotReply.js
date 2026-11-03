// Reads a /v1/prices reply into what the app keeps. A metal counts only when
// its price clears a floor no real spot price falls under. A reply where no
// metal clears its floor returns null, so the app treats it as a failed fetch:
// it keeps its saved prices and doesn't call them live or move their time.
// A metal that fails its floor gets no day change, so nothing quotes a change
// that came with a price the app threw out.

export const SPOT_METALS = ['silver', 'gold', 'platinum', 'palladium'];

export const SPOT_FLOORS = { silver: 10, gold: 1000, platinum: 100, palladium: 100 };

// Whether one metal's price is a plain decimal over its floor. The one check
// the app, the background fetch and the widget all use.
export const spotPriceOk = (metal, price) => {
  const n = toNum(price);
  return Number.isFinite(n) && n > SPOT_FLOORS[metal];
};

const NO_CHANGE = { amount: null, percent: null, prevClose: null };

// A plain decimal only, so a string like '0x1F40' or '8e3' never reads as a
// price. Number() alone would take both. Exported so the widget reads a
// price the same way.
const DECIMAL = /^\s*[+-]?(\d+(\.\d*)?|\.\d+)\s*$/;

export const toNum = (v) => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && DECIMAL.test(v)) return Number(v);
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
    const ok = spotPriceOk(metal, price);
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

// The time a reply's prices are shown and saved under: the reply's own
// timestamp when it carries one as text, else now.
export const spotReplyTime = (timestamp, now = new Date()) =>
  typeof timestamp === 'string' && timestamp ? timestamp : now.toISOString();

// What a read reply saves on the phone, as [key, value] pairs for
// AsyncStorage.multiSet: each live metal's spot and the time of the reply.
// Nothing for a failed read, so the saved prices and their time stay put.
export const spotSavePairs = (reply, timestamp, now = new Date()) => {
  if (!reply) return [];
  const pairs = SPOT_METALS.filter((m) => reply.liveMetals[m]).map((m) => [`stack_${m}_spot`, String(reply.spots[m])]);
  pairs.push(['stack_price_timestamp', spotReplyTime(timestamp, now)]);
  return pairs;
};

// Saves a read reply on the phone: the spots first, then their time in a
// write of its own. multiSet isn't atomic on every platform, so a save that
// fails partway throws before the time is written, and a half-failed save
// can't put a new time on old prices. A failed read saves nothing.
//
// Saves run one after another, so the app's fetch and the background fetch
// can't interleave their two writes and leave one reply's spots under the
// other's time. A save that fails still rejects for its own caller and
// doesn't stop the saves queued behind it.
let spotSaveChain = Promise.resolve();

const writeSpotPairs = async (storage, pairs) => {
  const [timeKey, time] = pairs.pop();
  if (pairs.length) await storage.multiSet(pairs);
  await storage.setItem(timeKey, time);
};

export const saveSpotReply = (storage, reply, timestamp, now = new Date()) => {
  const pairs = spotSavePairs(reply, timestamp, now);
  if (!pairs.length) return Promise.resolve();
  const run = spotSaveChain.then(() => writeSpotPairs(storage, pairs));
  spotSaveChain = run.catch(() => {});
  return run;
};

// The prices the widget is built from: only the metals that passed, so the
// widget never takes a price the app threw out. change_pct goes along only
// when the reply carried a usable one, so the widget still reads a missing
// change as unknown and leaves the stack's day change at 0, as it did before.
export const spotWidgetPrices = (reply, raw) => {
  if (!reply) return null;
  const out = {};
  for (const m of SPOT_METALS) {
    if (!reply.liveMetals[m]) continue;
    const pct = toNum(raw?.prices?.[m]?.change_pct);
    out[m] = Number.isFinite(pct) && pct > -100 ? { price: reply.spots[m], change_pct: pct } : { price: reply.spots[m] };
  }
  return out;
};
