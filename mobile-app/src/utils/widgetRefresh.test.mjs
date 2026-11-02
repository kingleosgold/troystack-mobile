// Run with: node --test mobile-app/src/utils/widgetRefresh.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WIDGET_PAYLOAD_KEY, priceOk, widgetChanges, backgroundWidgetPayload } from './widgetRefresh.js';

const spotChange = {
  silver: { amount: 1, percent: 2 },
  gold: { amount: 40, percent: 1 },
  platinum: { amount: -10, percent: -0.5 },
  palladium: { amount: 5, percent: 0.3 },
};
const allLive = { silver: true, gold: true, platinum: true, palladium: true };

test('every change goes out once every held metal is live', () => {
  const out = widgetChanges({ live: true, liveMetals: allLive, held: { silver: 10, gold: 1 }, dailyChange: 55, dailyChangePct: 1.2, spotChange });
  assert.equal(out.dailyChangeAmount, 55);
  assert.equal(out.dailyChangePercent, 1.2);
  assert.equal(out.goldChangeAmount, 40);
  assert.equal(out.platinumChangePercent, -0.5);
});

test('no change goes out before a live fetch lands', () => {
  const out = widgetChanges({ live: false, liveMetals: allLive, held: { silver: 10 }, dailyChange: 55, dailyChangePct: 1.2, spotChange });
  assert.equal(out.dailyChangeAmount, 0);
  assert.equal(out.dailyChangePercent, 0);
  assert.equal(out.silverChangeAmount, 0);
  assert.equal(out.goldChangePercent, 0);
});

test('a held metal that is not live keeps the stack change off the widget', () => {
  const out = widgetChanges({ live: true, liveMetals: { silver: true, gold: true }, held: { silver: 10, platinum: 2 }, dailyChange: 55, dailyChangePct: 1.2, spotChange });
  assert.equal(out.dailyChangeAmount, 0);
  assert.equal(out.dailyChangePercent, 0);
  assert.equal(out.silverChangeAmount, 1);
  assert.equal(out.platinumChangeAmount, 0);
  assert.equal(out.platinumChangePercent, 0);
});

test('a metal not held and not live only drops its own change', () => {
  const out = widgetChanges({ live: true, liveMetals: { silver: true, gold: true }, held: { silver: 10, platinum: 0 }, dailyChange: 55, dailyChangePct: 1.2, spotChange });
  assert.equal(out.dailyChangeAmount, 55);
  assert.equal(out.palladiumChangeAmount, 0);
});

test('missing or bad numbers go out as 0, never NaN', () => {
  const out = widgetChanges({ live: true, liveMetals: allLive, held: {}, dailyChange: NaN, dailyChangePct: undefined, spotChange: { gold: { amount: null, percent: 'x' } } });
  for (const v of Object.values(out)) assert.equal(v, 0);
});

test('price checks match the app floors', () => {
  assert.equal(priceOk('gold', 4500), true);
  assert.equal(priceOk('gold', 900), false);
  assert.equal(priceOk('silver', 75), true);
  assert.equal(priceOk('silver', 'abc'), false);
  assert.equal(priceOk('platinum', null), false);
});

const saved = {
  portfolioValue: 0,
  dailyChangeAmount: 0,
  dailyChangePercent: 0,
  silverSpot: 70, goldSpot: 4400, platinumSpot: 1500, palladiumSpot: 1200,
  silverOzt: 100, goldOzt: 2, platinumOzt: 1, palladiumOzt: 0,
  hasSubscription: true,
  hideValues: true,
  marketsClosed: false,
  goldSparkline: [1, 2, 3],
};

const prices = {
  silver: { price: 80, change_pct: 0 },
  gold: { price: 4500, change_pct: 1 },
  platinum: { price: 1600, change_pct: -1 },
  palladium: { price: 1300, change_pct: 2 },
};

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} vs ${b}`);

test('a background refresh keeps Gold, Hide Values and the sparklines from the app', () => {
  const out = backgroundWidgetPayload({ saved, prices, now: new Date('2026-11-02T15:00:00Z') });
  assert.equal(out.hasSubscription, true);
  assert.equal(out.hideValues, true);
  assert.deepEqual(out.goldSparkline, [1, 2, 3]);
  assert.equal(out.lastUpdated, '2026-11-02T15:00:00.000Z');
});

test('a background refresh values every metal, platinum and palladium included', () => {
  const out = backgroundWidgetPayload({ saved, prices });
  near(out.silverValue, 8000);
  near(out.goldValue, 9000);
  near(out.platinumValue, 1600);
  near(out.palladiumValue, 0);
  near(out.portfolioValue, 18600);
  assert.equal(out.palladiumSpot, 1300);
});

test('the stack change is figured on yesterday close over every held metal', () => {
  const out = backgroundWidgetPayload({ saved, prices });
  const yesterday = 100 * 80 + 2 * (4500 / 1.01) + 1 * (1600 / 0.99);
  near(out.dailyChangeAmount, 18600 - yesterday);
  near(out.dailyChangePercent, ((18600 - yesterday) / yesterday) * 100);
  near(out.goldChangeAmount, 4500 - 4500 / 1.01);
  assert.equal(out.goldChangePercent, 1);
});

test('a held metal whose price fails keeps its saved price and drops the stack change', () => {
  const out = backgroundWidgetPayload({ saved, prices: { ...prices, platinum: { price: 5, change_pct: 1 } } });
  assert.equal(out.platinumSpot, 1500);
  near(out.platinumValue, 1500);
  assert.equal(out.platinumChangeAmount, 0);
  assert.equal(out.dailyChangeAmount, 0);
  assert.equal(out.dailyChangePercent, 0);
  near(out.portfolioValue, 8000 + 9000 + 1500);
});

test('a held metal with no change_pct drops the stack change', () => {
  const out = backgroundWidgetPayload({ saved, prices: { ...prices, gold: { price: 4500 } } });
  assert.equal(out.dailyChangeAmount, 0);
  assert.equal(out.goldChangeAmount, 0);
  assert.equal(out.goldSpot, 4500);
});

test('a metal not held can fail without dropping the stack change', () => {
  const out = backgroundWidgetPayload({ saved, prices: { ...prices, palladium: null } });
  assert.notEqual(out.dailyChangeAmount, 0);
  assert.equal(out.palladiumSpot, 1200);
  assert.equal(out.palladiumChangeAmount, 0);
});

test('nothing goes to the widget without a saved picture or a usable price', () => {
  assert.equal(backgroundWidgetPayload({ saved: null, prices }), null);
  assert.equal(backgroundWidgetPayload({ saved: 'x', prices }), null);
  assert.equal(backgroundWidgetPayload({ saved, prices: null }), null);
  assert.equal(backgroundWidgetPayload({ saved, prices: { gold: { price: 1 } } }), null);
});

test('the saved picture is never changed in place', () => {
  const copy = JSON.parse(JSON.stringify(saved));
  backgroundWidgetPayload({ saved, prices });
  assert.deepEqual(saved, copy);
});

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('the background task builds from the saved picture, not a key nothing writes', () => {
  const bg = read('./backgroundTasks.js');
  assert.match(bg, /backgroundWidgetPayload\(\{ saved, prices: priceData\.prices \}\)/);
  assert.match(bg, /prices: raw\.prices,/);
  assert.doesNotMatch(bg, /stack_has_gold/);
});

test('the app saves what it sends, clears it at sign out and without Gold', () => {
  const app = read('../../App.js');
  assert.match(app, /if \(synced\) await AsyncStorage\.setItem\(WIDGET_PAYLOAD_KEY, JSON\.stringify\(widgetPayload\)\);/);
  assert.match(app, /'stack_midnight_snapshot',\n\s+WIDGET_PAYLOAD_KEY,/);
  assert.match(app, /if \(!hasGold && !hasLifetimeAccess\) AsyncStorage\.removeItem\(WIDGET_PAYLOAD_KEY\)/);
  assert.match(app, /dailyChangeAmount: changes\.dailyChangeAmount,/);
  assert.equal(WIDGET_PAYLOAD_KEY, 'stack_widget_payload');
});
