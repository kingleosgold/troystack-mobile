// What the iOS home screen widget is sent, from the app and from the
// background fetch. The app sends the whole picture: the subscription, Hide
// Values, every metal's ounces and the sparklines. The background fetch only
// has fresh prices, so it starts from the last picture the app sent (saved
// under WIDGET_PAYLOAD_KEY) and changes only the prices, values and day's
// change. Before this, the background fetch wrote a picture of its own that
// read the subscription from a key nothing writes, so a Gold member's widget
// went locked, Hide Values switched off and platinum and palladium dropped.
// Nothing here imports React Native, so it runs under `node --test`.

export const WIDGET_PAYLOAD_KEY = 'stack_widget_payload';

// What the widget is sent once the plan is known to be free or the account
// signs out: the locked view, with no values or ounces in it.
export const LOCKED_WIDGET = Object.freeze({ hasSubscription: false, hideValues: true });

// Whether the plan is known to be free, so the widget can lock. Gold and
// Lifetime start false on every launch, so a plan still loading, or a
// RevenueCat read that failed, never counts as free.
export const widgetPlanKnownFree = ({ loading, readOk, hasGold, hasLifetime }) =>
  !loading && !!readOk && !hasGold && !hasLifetime;

const METALS = ['silver', 'gold', 'platinum', 'palladium'];

// The same floors the app uses before it trusts a fetched price.
const FLOOR = { silver: 10, gold: 1000, platinum: 100, palladium: 100 };

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Whether a fetched price for one metal passes the app's check.
export const priceOk = (metal, price) => {
  const n = Number(price);
  return Number.isFinite(n) && n > FLOOR[metal];
};

// The day's change fields for the widget. A metal's own change goes out only
// while its price is live, and the stack's change only while every metal the
// stack holds is live, so the widget never shows a change over a saved price.
// Anything not live goes out as 0, which is what the widget showed before
// prices were live.
export const widgetChanges = ({ live, liveMetals, held, dailyChange, dailyChangePct, spotChange }) => {
  const metalLive = (metal) => !!live && !!liveMetals?.[metal];
  const out = {};
  for (const metal of METALS) {
    const ok = metalLive(metal);
    out[`${metal}ChangeAmount`] = ok ? num(spotChange?.[metal]?.amount) : 0;
    out[`${metal}ChangePercent`] = ok ? num(spotChange?.[metal]?.percent) : 0;
  }
  const allHeldLive = !!live && METALS.every((metal) => num(held?.[metal]) <= 0 || metalLive(metal));
  out.dailyChangeAmount = allHeldLive ? num(dailyChange) : 0;
  out.dailyChangePercent = allHeldLive ? num(dailyChangePct) : 0;
  return out;
};

// The widget picture after a background fetch, or null to leave the widget as
// it is. `saved` is the last picture the app sent and `prices` maps each metal
// to { price, change_pct } from /v1/prices. A metal whose price fails its
// check keeps the saved price and sends no change of its own. The stack's day
// change is figured only when every held metal got a price and a change, and
// is 0 otherwise.
export const backgroundWidgetPayload = ({ saved, prices, now = new Date() }) => {
  if (!saved || typeof saved !== 'object' || !prices || typeof prices !== 'object') return null;
  const next = { ...saved };
  const held = {};
  let today = 0;
  let yesterday = 0;
  let allHeldLive = true;
  let anyLive = false;
  for (const metal of METALS) {
    const ozt = num(saved[`${metal}Ozt`]);
    held[metal] = ozt;
    const fetched = prices[metal];
    const live = priceOk(metal, fetched?.price);
    const spot = live ? Number(fetched.price) : num(saved[`${metal}Spot`]);
    if (live) anyLive = true;
    next[`${metal}Spot`] = spot;
    next[`${metal}Value`] = ozt * spot;
    const pct = Number(fetched?.change_pct);
    const hasPct = live && Number.isFinite(pct) && pct > -100;
    if (hasPct) {
      const prevClose = spot / (1 + pct / 100);
      next[`${metal}ChangeAmount`] = spot - prevClose;
      next[`${metal}ChangePercent`] = pct;
      today += ozt * spot;
      yesterday += ozt * prevClose;
    } else {
      next[`${metal}ChangeAmount`] = 0;
      next[`${metal}ChangePercent`] = 0;
      if (ozt > 0) allHeldLive = false;
    }
  }
  if (!anyLive) return null;
  next.portfolioValue = METALS.reduce((sum, metal) => sum + next[`${metal}Value`], 0);
  if (allHeldLive && yesterday > 0) {
    next.dailyChangeAmount = today - yesterday;
    next.dailyChangePercent = ((today - yesterday) / yesterday) * 100;
  } else {
    next.dailyChangeAmount = 0;
    next.dailyChangePercent = 0;
  }
  next.lastUpdated = now.toISOString();
  return next;
};
