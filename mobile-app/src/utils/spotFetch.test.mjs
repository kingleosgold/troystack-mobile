// Run with: node --test mobile-app/src/utils/spotFetch.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runSpotFetch, SPOT_FETCH_OUTCOMES, keepsLive, LIVE_GRACE_MS } from './spotFetch.js';
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
  // onSaveError: null wires no handler at all, and apply swaps the screen's.
  s.call = (fetchRaw, { silent = false, save, onSaveError, apply } = {}) => runSpotFetch({
    gate,
    silent,
    fetchRaw,
    save: save || (async (reply, savedAt) => { s.saves.push(savedAt); }),
    onSaveError: onSaveError === null ? undefined : (onSaveError || ((e) => s.saveErrors.push(e?.message ?? e))),
    getSource: () => s.source,
    setSource: (v) => { s.source = v; },
    apply: apply || ((a) => { s.applied.push(a); s.source = a.source; }),
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

// Edge cases the #183 review named: a save error handler that throws, an
// AbortError, a thrown value that isn't an Error, and no handler at all.

test('a save error handler that throws still lets the reply show', async () => {
  const s = screen();
  const outcome = await s.call(async () => good(), {
    save: async () => { throw new Error('disk full'); },
    onSaveError: () => { throw new Error('handler broke'); },
  });
  assert.equal(outcome, 'applied');
  assert.equal(s.applied.length, 1);
  assert.equal(s.source, 'test');
});

test('a failed save with no handler still shows the reply', async () => {
  const s = screen();
  const outcome = await s.call(async () => good(), {
    save: async () => { throw new Error('disk full'); },
    onSaveError: null,
  });
  assert.equal(outcome, 'applied');
  assert.equal(s.applied.length, 1);
  assert.deepEqual(s.saveErrors, []);
});

test('an AbortError reads as a timeout and leaves a Live source alone', async () => {
  const s = screen();
  const abort = () => Object.assign(new Error('Aborted'), { name: 'AbortError' });
  assert.equal(await s.call(async () => { throw abort(); }), 'timeout');
  assert.equal(s.source, 'cached');
  s.source = 'live';
  assert.equal(await s.call(async () => { throw abort(); }, { silent: true }), 'timeout');
  assert.equal(s.source, 'live');
  assert.deepEqual(s.applied, []);
  assert.deepEqual(s.saves, []);
});

test('a thrown value that is not an Error reads failed and never rejects', async () => {
  for (const thrown of ['offline', null, undefined, 42, { name: 'Weird' }]) {
    const s = screen();
    s.source = 'live';
    const outcome = await s.call(async () => { throw thrown; }, { silent: true });
    assert.equal(outcome, 'failed', `thrown ${String(thrown)}`);
    assert.equal(s.source, 'cached');
    assert.deepEqual(s.applied, []);
  }
});

test('a save that rejects with a non-Error still shows the reply', async () => {
  const s = screen();
  const seen = [];
  const outcome = await s.call(async () => good(), {
    save: async () => { throw undefined; },
    onSaveError: (e) => { seen.push(e); },
  });
  assert.equal(outcome, 'applied');
  assert.deepEqual(seen, [undefined]);
  assert.equal(s.applied.length, 1);
});

// Gaps the #184 review named: apply throwing after a good save, and a save
// that fails while a newer call starts during it.

test('apply throwing after a good save reads failed and cached, with the save kept', async () => {
  const s = screen();
  s.source = 'live';
  const outcome = await s.call(async () => good(4600), {
    silent: true,
    apply: () => { throw new Error('setter broke'); },
  });
  assert.equal(outcome, 'failed');
  assert.equal(s.source, 'cached');
  // Storage already holds the reply, so the next launch starts from it.
  assert.deepEqual(s.saves, ['2026-11-04T06:00:00Z']);
  assert.deepEqual(s.saveErrors, []);
});

test('a save that fails while a newer call starts reports the error and shows only the newer reply', async () => {
  const s = screen();
  const saving = deferred();
  const first = s.call(async () => good(4400), { save: () => saving.promise });
  await new Promise((r) => setImmediate(r));
  const second = s.call(async () => good(4600));
  assert.equal(await second, 'applied');
  saving.reject(new Error('disk full'));
  assert.equal(await first, 'stale');
  assert.deepEqual(s.saveErrors, ['disk full']);
  assert.deepEqual(s.applied.map((a) => a.reply.spots.gold), [4600]);
  assert.equal(s.source, 'test');
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

// onMiss and keepsLive: Live stops once no reply has landed for a while.

const missRun = (fetchRaw, { gate = createLatestOnly(), onMiss, apply } = {}) => runSpotFetch({
  gate,
  fetchRaw,
  save: async () => {},
  getSource: () => 'live',
  setSource: () => {},
  apply: apply || (() => {}),
  now: () => new Date('2026-11-04T07:00:00.000Z'),
  onMiss,
});

test('onMiss hears a timeout, a failure and an empty reply', async () => {
  const heard = [];
  const onMiss = (o) => heard.push(o);
  assert.equal(await missRun(async () => { throw timeoutError(); }, { onMiss }), 'timeout');
  assert.equal(await missRun(async () => { throw new Error('offline'); }, { onMiss }), 'failed');
  assert.equal(await missRun(async () => ({ prices: {} }), { onMiss }), 'empty');
  assert.deepEqual(heard, ['timeout', 'failed', 'empty']);
});

test('onMiss stays quiet for a reply that lands', async () => {
  const heard = [];
  const applied = [];
  const outcome = await missRun(async () => good(), { onMiss: (o) => heard.push(o), apply: (a) => applied.push(a) });
  assert.equal(outcome, 'applied');
  assert.equal(applied.length, 1);
  assert.deepEqual(heard, []);
});

test('onMiss stays quiet when a newer fetch owns the screen', async () => {
  const gate = createLatestOnly();
  const heard = [];
  const older = deferred();
  const first = missRun(() => older.promise, { gate, onMiss: (o) => heard.push(o) });
  gate.begin(); // a newer fetch started
  older.reject(timeoutError());
  assert.equal(await first, 'stale');
  assert.deepEqual(heard, []);
});

test('an onMiss that throws still resolves the outcome', async () => {
  const outcome = await missRun(async () => { throw new Error('offline'); }, { onMiss: () => { throw new Error('boom'); } });
  assert.equal(outcome, 'failed');
});

test('keepsLive holds Live for the grace and drops it after', () => {
  const liveAt = 1_000_000;
  assert.equal(LIVE_GRACE_MS, 5 * 60 * 1000);
  assert.equal(keepsLive({ liveAt, now: liveAt + 60_000 }), true);
  assert.equal(keepsLive({ liveAt, now: liveAt + LIVE_GRACE_MS }), true);
  assert.equal(keepsLive({ liveAt, now: liveAt + LIVE_GRACE_MS + 1 }), false);
  assert.equal(keepsLive({ liveAt, now: liveAt + 3 * 60 * 60 * 1000 }), false);
  // A clock that moved back counts as fresh.
  assert.equal(keepsLive({ liveAt, now: liveAt - 60_000 }), true);
  // Nothing landed yet.
  assert.equal(keepsLive({ liveAt: null, now: liveAt }), false);
  assert.equal(keepsLive({ liveAt: undefined, now: liveAt }), false);
  assert.equal(keepsLive({ liveAt: NaN, now: liveAt }), false);
});

test('App.js drops Live on a miss past the grace and stamps each landed reply', () => {
  const src = readFileSync(new URL('../../App.js', import.meta.url), 'utf8');
  const start = src.indexOf('const fetchSpotPrices = (silent = false) => runSpotFetch({');
  const body = src.slice(start, src.indexOf('const onRefreshDashboard', start));
  assert.match(body, /onMiss: \(\) => \{\s*if \(!keepsLive\(\{ liveAt: spotLiveAtRef\.current, now: Date\.now\(\) \}\)\) setSpotPricesLive\(false\);/);
  assert.match(body, /spotLiveAtRef\.current = Date\.now\(\);\s*setSpotPricesLive\(true\);/);
  // Signing out clears the stamp with the rest of the spot state.
  assert.match(src, /setPriceTimestamp\(null\);\s*spotLiveAtRef\.current = null;\s*setSpotPricesLive\(false\);/);
});
