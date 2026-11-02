// Run with: node --test mobile-app/src/utils/spotReply.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readSpotReply } from './spotReply.js';

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
