// Run with: node --test mobile-app/src/utils/spotReply.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readSpotReply, spotReplyTime, spotSavePairs, saveSpotReply, spotWidgetPrices, spotPriceOk } from './spotReply.js';

const full = {
  prices: {
    gold: { price: 4500, change_pct: 1 },
    silver: { price: 80, change_pct: -2 },
    platinum: { price: 2100, change_pct: 0 },
    palladium: { price: 1700 },
  },
};

test('a full reply keeps every metal live with its day change', () => {
  const r = readSpotReply(full);
  assert.deepEqual(r.liveMetals, { silver: true, gold: true, platinum: true, palladium: true });
  assert.deepEqual(r.spots, { silver: 80, gold: 4500, platinum: 2100, palladium: 1700 });
  assert.equal(r.change.gold.percent, 1);
  assert.ok(Math.abs(r.change.gold.prevClose - 4500 / 1.01) < 1e-9);
  assert.ok(Math.abs(r.change.gold.amount - (4500 - 4500 / 1.01)) < 1e-9);
  assert.equal(r.change.silver.percent, -2);
  assert.ok(r.change.silver.amount < 0);
  assert.deepEqual(r.change.platinum, { amount: 0, percent: 0, prevClose: 2100 });
});

test('a missing change_pct still reads flat, as before', () => {
  assert.deepEqual(readSpotReply(full).change.palladium, { amount: 0, percent: 0, prevClose: 1700 });
});

test('a reply where no metal clears its floor counts as a failed fetch', () => {
  assert.equal(readSpotReply({ prices: { gold: { price: 0 }, silver: { price: 5 }, platinum: { price: null }, palladium: {} } }), null);
  assert.equal(readSpotReply({ prices: {} }), null);
  assert.equal(readSpotReply({ prices: { gold: { price: 'abc' }, silver: { price: NaN } } }), null);
});

test('a reply with no prices object counts as a failed fetch', () => {
  assert.equal(readSpotReply(null), null);
  assert.equal(readSpotReply(undefined), null);
  assert.equal(readSpotReply({}), null);
  assert.equal(readSpotReply({ prices: null }), null);
  assert.equal(readSpotReply({ prices: 'x' }), null);
  assert.equal(readSpotReply('x'), null);
});

test('a metal under its floor is not live and carries no day change', () => {
  const r = readSpotReply({ prices: { gold: { price: 4500, change_pct: 1 }, silver: { price: 3, change_pct: 40 } } });
  assert.equal(r.liveMetals.silver, false);
  assert.equal(r.spots.silver, undefined);
  assert.deepEqual(r.change.silver, { amount: null, percent: null, prevClose: null });
  assert.deepEqual(r.change.platinum, { amount: null, percent: null, prevClose: null });
  assert.equal(r.liveMetals.gold, true);
});

test('the floors match the old checks at their edges', () => {
  const r = readSpotReply({ prices: { silver: { price: 10 }, gold: { price: 1000.01 }, platinum: { price: 100 }, palladium: { price: 100.5 } } });
  assert.deepEqual(r.liveMetals, { silver: false, gold: true, platinum: false, palladium: true });
});

test('a numeric string price is read as a number', () => {
  const r = readSpotReply({ prices: { gold: { price: '4500.5', change_pct: '0.5' } } });
  assert.equal(r.spots.gold, 4500.5);
  assert.equal(r.change.gold.percent, 0.5);
  assert.equal(readSpotReply({ prices: { gold: { price: '' } } }), null);
});

test('infinite prices are thrown out', () => {
  assert.equal(readSpotReply({ prices: { gold: { price: Infinity } } }), null);
});

test('a change_pct at or under -100 or not a number reads flat', () => {
  for (const pct of [-100, -150, 'x', NaN, Infinity, null]) {
    assert.deepEqual(readSpotReply({ prices: { gold: { price: 4500, change_pct: pct } } }).change.gold, { amount: 0, percent: 0, prevClose: 4500 });
  }
});

test('App.js reads the reply through readSpotReply and keeps a failed read off Live', () => {
  const src = readFileSync(new URL('../../App.js', import.meta.url), 'utf8');
  const start = src.indexOf('const fetchSpotPrices = async');
  const end = src.indexOf('const onRefreshDashboard', start);
  const body = src.slice(start, end);
  assert.ok(body.includes('readSpotReply(raw)'));
  const ifAt = body.indexOf('if (reply)');
  const liveAt = body.indexOf('setSpotPricesLive(true)');
  const elseAt = body.indexOf('} else {', ifAt);
  assert.ok(ifAt > 0 && liveAt > ifAt && liveAt < elseAt);
});

test('hex and exponent strings never read as a price', () => {
  assert.equal(readSpotReply({ prices: { gold: { price: '0x1F40' } } }), null);
  assert.equal(readSpotReply({ prices: { gold: { price: '5e3' } } }), null);
  assert.equal(readSpotReply({ prices: { gold: { price: 'Infinity' } } }), null);
  assert.equal(readSpotReply({ prices: { gold: { price: ' 4500.25 ' } } }).spots.gold, 4500.25);
  assert.equal(readSpotReply({ prices: { gold: { price: 4500, change_pct: '1e2' } } }).change.gold.percent, 0);
  assert.equal(readSpotReply({ prices: { gold: { price: 4500, change_pct: '-.5' } } }).change.gold.percent, -0.5);
});

test('a failed read saves nothing, and a good one saves each live spot and the time', () => {
  assert.deepEqual(spotSavePairs(null, 't'), []);
  const r = readSpotReply({ prices: { gold: { price: 4500 }, silver: { price: 3 }, platinum: { price: 2100 } } });
  assert.deepEqual(spotSavePairs(r, '2026-11-02T12:00:00Z'), [
    ['stack_gold_spot', '4500'],
    ['stack_platinum_spot', '2100'],
    ['stack_price_timestamp', '2026-11-02T12:00:00Z'],
  ]);
  const now = new Date('2026-11-02T13:00:00.000Z');
  for (const ts of [undefined, null, '', 5]) {
    assert.deepEqual(spotSavePairs(r, ts, now).at(-1), ['stack_price_timestamp', now.toISOString()]);
  }
});

test('the widget only gets the metals that passed, with change_pct only when usable', () => {
  assert.equal(spotWidgetPrices(null, {}), null);
  const raw = { prices: { gold: { price: 4500, change_pct: '1.5' }, silver: { price: 80 }, platinum: { price: 50, change_pct: 3 }, palladium: { price: 1700, change_pct: -120 } } };
  assert.deepEqual(spotWidgetPrices(readSpotReply(raw), raw), {
    gold: { price: 4500, change_pct: 1.5 },
    silver: { price: 80 },
    palladium: { price: 1700 },
  });
});

test('the background task reads the reply the way the app does', () => {
  const bg = readFileSync(new URL('./backgroundTasks.js', import.meta.url), 'utf8');
  assert.match(bg, /const reply = readSpotReply\(raw\);\n\s+if \(reply\) \{/);
  assert.match(bg, /await saveSpotReply\(AsyncStorage, reply, raw\.timestamp\);/);
  assert.doesNotMatch(bg, /AsyncStorage\.setItem\('stack_price_timestamp'/);
  assert.doesNotMatch(bg, /change_pct \|\| 0/);
});

test('spotPriceOk reads a price one way for every caller', () => {
  assert.equal(spotPriceOk('gold', 4500), true);
  assert.equal(spotPriceOk('gold', '4500.5'), true);
  assert.equal(spotPriceOk('gold', 1000), false);
  for (const v of ['0x1F40', '5e3', 'Infinity', '', null, undefined, true, [4500]]) {
    assert.equal(spotPriceOk('gold', v), false, String(v));
  }
});

test('App.js saves a good reply through saveSpotReply before Live', () => {
  const src = readFileSync(new URL('../../App.js', import.meta.url), 'utf8');
  const start = src.indexOf('const fetchSpotPrices = async');
  const body = src.slice(start, src.indexOf('const onRefreshDashboard', start));
  const ifAt = body.indexOf('if (reply)');
  const elseAt = body.indexOf('} else {', ifAt);
  const writeAt = body.indexOf('await saveSpotReply(AsyncStorage, reply, savedAt)');
  const liveAt = body.indexOf('setSpotPricesLive(true)');
  assert.ok(ifAt > 0 && writeAt > ifAt && liveAt > writeAt && liveAt < elseAt);
  assert.ok(!body.includes('AsyncStorage.multiSet('));
  assert.ok(body.includes('setPriceTimestamp(savedAt)'));
  assert.ok(!/setItem\('stack_(silver|gold|platinum|palladium)_spot'/.test(body));
  assert.ok(!body.includes("setItem('stack_price_timestamp'"));
});

test('the time shown is the time saved, from one helper', () => {
  const now = new Date('2026-11-03T06:00:00.000Z');
  assert.equal(spotReplyTime('2026-11-03T05:59:00Z', now), '2026-11-03T05:59:00Z');
  for (const ts of [undefined, null, '', 5]) assert.equal(spotReplyTime(ts, now), now.toISOString());
  const r = readSpotReply({ prices: { gold: { price: 4500 } } });
  const at = spotReplyTime(undefined, now);
  assert.deepEqual(spotSavePairs(r, at).at(-1), ['stack_price_timestamp', at]);
});

test('App.js keeps a good reply Live when its save fails', () => {
  const src = readFileSync(new URL('../../App.js', import.meta.url), 'utf8');
  const start = src.indexOf('const fetchSpotPrices = async');
  const body = src.slice(start, src.indexOf('const onRefreshDashboard', start));
  const timeAt = body.indexOf('const savedAt = spotReplyTime(raw.timestamp)');
  const tryAt = body.indexOf('try {', timeAt);
  const writeAt = body.indexOf('await saveSpotReply(AsyncStorage, reply, savedAt)');
  const catchAt = body.indexOf('} catch (saveError)', writeAt);
  const liveAt = body.indexOf('setSpotPricesLive(true)');
  assert.ok(timeAt > 0 && tryAt > timeAt && writeAt > tryAt && catchAt > writeAt && liveAt > catchAt);
});

const fakeStorage = ({ failMultiSet = false } = {}) => {
  const calls = [];
  return {
    calls,
    multiSet: async (pairs) => {
      calls.push(['multiSet', pairs]);
      if (failMultiSet) throw new Error('disk full');
    },
    setItem: async (k, v) => { calls.push(['setItem', k, v]); },
  };
};

test('saveSpotReply writes the time only after the spots land', async () => {
  const r = readSpotReply({ prices: { gold: { price: 4500 }, silver: { price: 80 } } });
  const ok = fakeStorage();
  await saveSpotReply(ok, r, '2026-11-03T08:00:00Z');
  assert.deepEqual(ok.calls, [
    ['multiSet', [['stack_silver_spot', '80'], ['stack_gold_spot', '4500']]],
    ['setItem', 'stack_price_timestamp', '2026-11-03T08:00:00Z'],
  ]);
  const bad = fakeStorage({ failMultiSet: true });
  await assert.rejects(saveSpotReply(bad, r, '2026-11-03T08:00:00Z'), /disk full/);
  assert.ok(!bad.calls.some((c) => c[0] === 'setItem'));
  const none = fakeStorage();
  await saveSpotReply(none, null, 't');
  assert.deepEqual(none.calls, []);
  const now = new Date('2026-11-03T09:00:00.000Z');
  const later = fakeStorage();
  await saveSpotReply(later, r, undefined, now);
  assert.deepEqual(later.calls.at(-1), ['setItem', 'stack_price_timestamp', now.toISOString()]);
});

test('saveSpotReply runs saves one after another so two replies never mix', async () => {
  const a = readSpotReply({ prices: { gold: { price: 4500 }, silver: { price: 80 } } });
  const b = readSpotReply({ prices: { gold: { price: 4600 }, silver: { price: 81 } } });
  const calls = [];
  let release;
  const gate = new Promise((res) => { release = res; });
  const slow = {
    multiSet: async (pairs) => { calls.push(['multiSet', pairs]); if (pairs[0][1] === '80') await gate; },
    setItem: async (k, v) => { calls.push(['setItem', k, v]); },
  };
  const first = saveSpotReply(slow, a, 'tA');
  const second = saveSpotReply(slow, b, 'tB');
  await new Promise((res) => setTimeout(res, 10));
  assert.deepEqual(calls, [['multiSet', [['stack_silver_spot', '80'], ['stack_gold_spot', '4500']]]]);
  release();
  await Promise.all([first, second]);
  assert.deepEqual(calls, [
    ['multiSet', [['stack_silver_spot', '80'], ['stack_gold_spot', '4500']]],
    ['setItem', 'stack_price_timestamp', 'tA'],
    ['multiSet', [['stack_silver_spot', '81'], ['stack_gold_spot', '4600']]],
    ['setItem', 'stack_price_timestamp', 'tB'],
  ]);
});

test('a failed save rejects for its caller and the next save still runs', async () => {
  const r = readSpotReply({ prices: { gold: { price: 4500 } } });
  const bad = fakeStorage({ failMultiSet: true });
  const ok = fakeStorage();
  const failed = saveSpotReply(bad, r, 't1');
  const next = saveSpotReply(ok, r, 't2');
  await assert.rejects(failed, /disk full/);
  await next;
  assert.deepEqual(ok.calls.at(-1), ['setItem', 'stack_price_timestamp', 't2']);
});

test('the time is taken when the save is asked for, not when it runs', async () => {
  const r = readSpotReply({ prices: { gold: { price: 4500 } } });
  const s = fakeStorage();
  const now = new Date('2026-11-03T11:00:00.000Z');
  await saveSpotReply(s, r, undefined, now);
  assert.deepEqual(s.calls.at(-1), ['setItem', 'stack_price_timestamp', now.toISOString()]);
});
