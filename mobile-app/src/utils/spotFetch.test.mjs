// Run with: node --test mobile-app/src/utils/spotFetch.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runSpotFetch, SPOT_FETCH_OUTCOMES } from './spotFetch.js';
import { createLatestOnly } from './latestOnly.js';
import { FOREGROUND_PRICE_FETCH_TIMEOUT_MS } from './spotReply.js';

const good = (gold = 4500, extra = {}) => ({
  source: 'test',
  timestamp: '2026-11-04T06:00:00Z',
  prices: { gold: { price: gold, change_pct: 1 }, silver: { price: 80 } },
  ...extra,
});

// A promise the test settles by hand, so it can choose which call lands first.
const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const timeoutError = () => Object.assign(new Error('price fetch timed out'), { name: 'TimeoutError' });

// One screen shared by every call, the way App.js's state is.
const screen = (gate = createLatestOnly()) => {
  const s = { source: 'cached', applied: [], saves: [], saveErrors: [] };
  s.gate = gate;
  s.call = (fetchRaw, { silent = false, save } = {}) => runSpotFetch({
    gate,
    silent,
    fetchRaw,
    save: save || (async (reply, savedAt) => { s.saves.push(savedAt); }),
    onSaveError: (e) => s.saveErrors.push(e.message),
    getSource: () => s.source,
    setSource: (v) => { s.source = v; },
    apply: (a) => { s.applied.push(a); s.source = a.source; },
    now: () => new Date('2026-11-04T07:00:00.000Z'),
  });
  return s;
};

test('a good reply saves first, then applies prices, time and source together', async () => {
  const s = screen();
  const order = [];
  const outcome = await runSpotFetch({
    gate: s.gate,
    fetchRaw: async () => good(),
    save: async (reply, savedAt) => { order.push(['save', savedAt]); },
    getSource: () => s.source,
    setSource: (v) => { order.push(['source', v]); },
    apply: (a) => { order.push(['apply', a.savedAt, a.source, a.reply.spots.gold]); },
  });
  assert.equal(outcome, 'applied');
  assert.deepEqual(order, [
    ['source', 'loading...'],
    ['save', '2026-11-04T06:00:00Z'],
    ['apply', '2026-11-04T06:00:00Z', 'test', 4500],
  ]);
});

test('a reply without a source reads as live, and without a time takes now', async () => {
  const s = screen();
  assert.equal(await s.call(async () => ({ prices: { gold: { price: 4500 } } })), 'applied');
  assert.equal(s.applied[0].source, 'live');
  assert.equal(s.applied[0].savedAt, '2026-11-04T07:00:00.000Z');
  assert.deepEqual(s.saves, ['2026-11-04T07:00:00.000Z']);
});

test('a silent call leaves the source alone until its reply applies', async () => {
  const s = screen();
  s.source = 'live';
  const d = deferred();
  const run = s.call(() => d.promise, { silent: true });
  assert.equal(s.source, 'live');
  d.resolve(good());
  assert.equal(await run, 'applied');
});

test('a reply with no usable metal saves nothing and reads cached', async () => {
  const s = screen();
  assert.equal(await s.call(async () => ({ prices: { gold: { price: 5 } } })), 'empty');
  assert.equal(await s.call(async () => null), 'empty');
  assert.equal(s.source, 'cached');
  assert.deepEqual(s.saves, []);
  assert.deepEqual(s.applied, []);
});

test('a failed save still shows the reply as live', async () => {
  const s = screen();
  const outcome = await s.call(async () => good(), { save: async () => { throw new Error('disk full'); } });
  assert.equal(outcome, 'applied');
  assert.deepEqual(s.saveErrors, ['disk full']);
  assert.equal(s.applied.length, 1);
});

test('a timeout leaves prices alone and clears only a loading', async () => {
  const s = screen();
  assert.equal(await s.call(async () => { throw timeoutError(); }), 'timeout');
  assert.equal(s.source, 'cached');
  s.source = 'live';
  assert.equal(await s.call(async () => { throw timeoutError(); }, { silent: true }), 'timeout');
  assert.equal(s.source, 'live');
  assert.deepEqual(s.applied, []);
});

test('a network error reads cached', async () => {
  const s = screen();
  s.source = 'live';
  assert.equal(await s.call(async () => { throw new Error('Network request failed'); }, { silent: true }), 'failed');
  assert.equal(s.source, 'cached');
});

test('an older reply landing after a newer one shows and saves nothing', async () => {
  const s = screen();
  const older = deferred();
  const newer = deferred();
  const first = s.call(() => older.promise);
  const second = s.call(() => newer.promise);
  newer.resolve(good(4600));
  assert.equal(await second, 'applied');
  older.resolve(good(4400));
  assert.equal(await first, 'stale');
  assert.deepEqual(s.applied.map((a) => a.reply.spots.gold), [4600]);
  assert.equal(s.saves.length, 1);
});

test('an older call that fails late cannot turn the newer Live to cached', async () => {
  const s = screen();
  const older = deferred();
  const first = s.call(() => older.promise);
  assert.equal(await s.call(async () => good(4600)), 'applied');
  older.reject(new Error('Network request failed'));
  assert.equal(await first, 'stale');
  assert.equal(s.source, 'test');
  const olderTimeout = deferred();
  const third = s.call(() => olderTimeout.promise, { silent: true });
  // A newer call starts and fails, then the older one times out.
  assert.equal(await s.call(async () => { throw new Error('boom'); }, { silent: true }), 'failed');
  olderTimeout.reject(timeoutError());
  assert.equal(await third, 'stale');
});

test('a reply that goes stale during its save shows nothing', async () => {
  const s = screen();
  const saving = deferred();
  const first = s.call(async () => good(4400), { save: () => saving.promise });
  await new Promise((r) => setImmediate(r));
  const second = s.call(async () => good(4600));
  assert.equal(await second, 'applied');
  saving.resolve();
  assert.equal(await first, 'stale');
  assert.deepEqual(s.applied.map((a) => a.reply.spots.gold), [4600]);
});

test('the newest call clears a loading an older, dropped call set', async () => {
  const s = screen();
  const older = deferred();
  const first = s.call(() => older.promise);
  assert.equal(s.source, 'loading...');
  assert.equal(await s.call(async () => { throw timeoutError(); }, { silent: true }), 'timeout');
  assert.equal(s.source, 'cached');
  older.resolve(good());
  assert.equal(await first, 'stale');
  assert.equal(s.source, 'cached');
});

test('every outcome is one of the named ones', () => {
  assert.deepEqual(SPOT_FETCH_OUTCOMES, ['applied', 'stale', 'empty', 'timeout', 'failed']);
});

test('App.js wires fetchSpotPrices to runSpotFetch with its gate, 10s read and save', () => {
  const src = readFileSync(new URL('../../App.js', import.meta.url), 'utf8');
  assert.match(src, /const spotFetchGate = useRef\(createLatestOnly\(\)\);/);
  const start = src.indexOf('const fetchSpotPrices = (silent = false) => runSpotFetch({');
  assert.ok(start > 0);
  const body = src.slice(start, src.indexOf('const onRefreshDashboard', start));
  assert.ok(body.includes('gate: spotFetchGate.current,'));
  assert.match(body, /fetchSpotRaw\(fetch, `\$\{API_BASE_URL\}\/v1\/prices`, FOREGROUND_PRICE_FETCH_TIMEOUT_MS\)/);
  assert.ok(body.includes('save: (reply, savedAt) => saveSpotReply(AsyncStorage, reply, savedAt),'));
  assert.ok(body.includes('getSource: () => priceSourceRef.current,'));
  assert.ok(body.includes('setSpotPricesLive(true)'));
  assert.ok(body.includes('setPriceTimestamp(savedAt)'));
  assert.ok(!body.includes('AsyncStorage.multiSet('));
  assert.ok(!body.includes("setItem('stack_price_timestamp'"));
  assert.equal(FOREGROUND_PRICE_FETCH_TIMEOUT_MS, 10000);
});

test('App.js logs the launch fetch from its outcome, not the source after it', () => {
  const src = readFileSync(new URL('../../App.js', import.meta.url), 'utf8');
  const at = src.indexOf("logLifecycleEvent('app:initial_spot_fetch_start')");
  const block = src.slice(at, src.indexOf("logLifecycleEvent('app:initial_spot_fetch_end', { ok: false", at));
  assert.match(block, /fetchSpotPrices\(\)\.then\(\(outcome\) => \{/);
  assert.ok(block.includes("ok: outcome === 'applied',"));
});
