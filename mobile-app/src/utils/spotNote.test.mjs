// Run with: node --test mobile-app/src/utils/spotNote.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spotHeader, spotNote, savedWhen, metalNotLive } from './spotNote.js';

// Local times, so the checks hold in any time zone
const now = new Date(2026, 10, 2, 9, 5);

test('the header says Live only once a live fetch has landed', () => {
  assert.equal(spotHeader(true), 'Live Spot');
  assert.equal(spotHeader(false), 'Spot');
});

test('no note once prices are live', () => {
  assert.equal(spotNote({ live: true, timestamp: null, now }), null);
  assert.equal(spotNote({ live: true, timestamp: new Date(2026, 10, 1).toISOString(), now }), null);
});

test('a new install with nothing saved says it is waiting, never a saved time', () => {
  assert.equal(spotNote({ live: false, timestamp: null, now }), 'Waiting for live prices');
  assert.equal(spotNote({ live: false, timestamp: undefined, now }), 'Waiting for live prices');
});

test('a saved time that cannot be read still says the prices are saved', () => {
  assert.equal(spotNote({ live: false, timestamp: 'not a date', now }), 'Saved prices');
});

test('saved prices name when they were fetched', () => {
  const earlier = new Date(2026, 10, 2, 7, 40).toISOString();
  assert.equal(spotNote({ live: false, timestamp: earlier, now }), 'Saved prices from today at 7:40 AM');
  const yesterday = new Date(2026, 10, 1, 15, 4).toISOString();
  assert.equal(spotNote({ live: false, timestamp: yesterday, now }), 'Saved prices from Nov 1 at 3:04 PM');
});

test('the clock reads noon and midnight as 12', () => {
  assert.equal(savedWhen(new Date(2026, 10, 2, 0, 0).toISOString(), now), 'today at 12:00 AM');
  assert.equal(savedWhen(new Date(2026, 10, 2, 12, 30).toISOString(), now), 'today at 12:30 PM');
});

test('a saved time from another year shows the year', () => {
  assert.equal(savedWhen(new Date(2025, 11, 31, 23, 59).toISOString(), now), 'Dec 31, 2025 at 11:59 PM');
});

test('the same date in another month or year is not today', () => {
  assert.equal(savedWhen(new Date(2026, 9, 2, 8, 0).toISOString(), now), 'Oct 2 at 8:00 AM');
  assert.equal(savedWhen(new Date(2025, 10, 2, 8, 0).toISOString(), now), 'Nov 2, 2025 at 8:00 AM');
});

test('a tile is not live before any live fetch, or when the fetch left its metal out', () => {
  assert.equal(metalNotLive({ live: false, liveMetals: {}, metal: 'gold' }), true);
  assert.equal(metalNotLive({ live: false, liveMetals: { gold: true }, metal: 'gold' }), true);
  assert.equal(metalNotLive({ live: true, liveMetals: { gold: true, silver: false }, metal: 'silver' }), true);
  assert.equal(metalNotLive({ live: true, liveMetals: { gold: true }, metal: 'platinum' }), true);
  assert.equal(metalNotLive({ live: true, liveMetals: { gold: true }, metal: 'gold' }), false);
  assert.equal(metalNotLive({ live: true, liveMetals: undefined, metal: 'gold' }), true);
});

test('App.js wires the note, the header and the tile mark on the Dashboard', () => {
  const app = readFileSync(new URL('../../App.js', import.meta.url), 'utf8');
  assert.match(app, /const effSpotLive = demoData \? true : spotPricesLive;/);
  assert.match(app, /spotNote\(\{ live: effSpotLive, timestamp: priceTimestamp, now: todayDate \}\)/);
  assert.match(app, /\{spotHeader\(effSpotLive\)\}/);
  assert.doesNotMatch(app, />Live Spot</);
  assert.match(app, /metalNotLive\(\{ live: effSpotLive, liveMetals: liveSpotMetals, metal: m\.key \}\)/);
  assert.match(app, /!effMarketsClosed && effSpotLive && \(\(\) => \{/);
  assert.match(app, /const aiSummary = !effSpotLive\s*\? null/);
  assert.match(app, /\{aiSummary && \(/);
  assert.match(app, /No live price yet/);
  assert.match(app, /holdingsImpact\.every\(m => !metalNotLive\(/);
});
