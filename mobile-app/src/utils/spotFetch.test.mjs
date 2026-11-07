// Run with: node --test mobile-app/src/utils/spotFetch.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runSpotFetch, SPOT_FETCH_OUTCOMES, keepsLive, dropStaleLive, LIVE_GRACE_MS, SET_BACK_TOLERANCE_MS, setBackPast } from './spotFetch.js';
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
  assert.ok(body.includes('setSpotPricesLive(keepsLive({ liveAt: landedAt, now: Date.now() }))'));
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
  assert.match(body, /onMiss: \(\) => \{\s*dropStaleLive\(\{ liveAtRef: spotLiveAtRef, now: Date\.now\(\), setLive: setSpotPricesLive \}\);/);
  assert.match(body, /apply: \(\{ reply, savedAt, source, landedAt \}\) => \{/);
  assert.match(body, /spotLiveAtRef\.current = landedAt;\s*setSpotPricesLive\(keepsLive\(\{ liveAt: landedAt, now: Date\.now\(\) \}\)\);/);
  // Signing out keeps the market's prices, their stamp and Live.
  const reset = src.slice(src.indexOf('const resetAllState = (fullReset = true) => {'), src.indexOf('const clearAllData = async () => {'));
  assert.ok(!reset.includes('spotLiveAtRef.current'));
  assert.ok(!reset.includes('setSpotPricesLive('));
});

test('onMiss stays quiet when a newer fetch starts during the save', async () => {
  const gate = createLatestOnly();
  const heard = [];
  const saving = deferred();
  const first = runSpotFetch({
    gate,
    fetchRaw: async () => good(),
    save: () => saving.promise,
    getSource: () => 'live',
    setSource: () => {},
    apply: () => { throw new Error('a stale call must not apply'); },
    onMiss: (o) => heard.push(o),
  });
  await new Promise((r) => setImmediate(r));
  gate.begin(); // a newer fetch started while this one saved
  saving.resolve();
  assert.equal(await first, 'stale');
  assert.deepEqual(heard, []);
});

test('App.js keeps the widget syncing once a reply landed, and drops stale Live on foreground', () => {
  const src = readFileSync(new URL('../../App.js', import.meta.url), 'utf8');
  // The widget effect runs on any landed reply this session, not only while Live.
  assert.match(src, /if \(dataLoaded && spotLandedOnce && \(hasGold \|\| hasLifetimeAccess\)\) \{\s*syncWidget\(\);/);
  assert.ok(!/if \(dataLoaded && spotPricesLive && \(hasGold \|\| hasLifetimeAccess\)\) \{\s*syncWidget\(\);/.test(src));
  assert.match(src, /setSpotPricesLive\(keepsLive\(\{ liveAt: landedAt, now: Date\.now\(\) \}\)\);\s*setSpotLandedOnce\(true\);/);
  // A reset holds the widget until a reply lands in the new session.
  const reset = src.slice(src.indexOf('const resetAllState = (fullReset = true) => {'), src.indexOf('const clearAllData = async () => {'));
  assert.match(reset, /setSpotLandedOnce\(false\);/);
  // Coming back from the background drops Live before the fetch when it's past the grace.
  const fg = src.indexOf("App came to foreground - fetching fresh prices immediately");
  const block = src.slice(fg, src.indexOf('fetchSpotPrices(true)', fg));
  assert.match(block, /dropStaleLive\(\{ liveAtRef: spotLiveAtRef, now: Date\.now\(\), setLive: setSpotPricesLive, setBackDrops: true \}\);/);
});

// dropStaleLive: the screen's check on a miss and on foreground.
const liveCheck = (liveAt) => {
  const ref = { current: liveAt };
  const sets = [];
  return { ref, sets, run: (now) => dropStaleLive({ liveAtRef: ref, now, setLive: (v) => sets.push(v) }) };
};

test('dropStaleLive keeps Live inside the grace and drops it after', () => {
  const c = liveCheck(1_000_000);
  assert.equal(c.run(1_000_000 + LIVE_GRACE_MS), true);
  assert.deepEqual(c.sets, []);
  assert.equal(c.run(1_000_000 + LIVE_GRACE_MS + 1), false);
  assert.deepEqual(c.sets, [false]);
  assert.equal(c.ref.current, 1_000_000);
});

test('dropStaleLive counts the grace from a clock set back, not from the old stamp', () => {
  const liveAt = 10_000_000;
  const c = liveCheck(liveAt);
  // The clock jumps back an hour: still Live, and the stamp moves to now.
  const back = liveAt - 60 * 60 * 1000;
  assert.equal(c.run(back), true);
  assert.equal(c.ref.current, back);
  // Misses keep coming. Without the re-stamp this would stay Live for an hour.
  assert.equal(c.run(back + LIVE_GRACE_MS), true);
  assert.equal(c.run(back + LIVE_GRACE_MS + 1), false);
  assert.deepEqual(c.sets, [false]);
});

test('dropStaleLive with nothing landed drops Live and leaves the stamp empty', () => {
  for (const liveAt of [null, undefined, NaN]) {
    const c = liveCheck(liveAt);
    assert.equal(c.run(5_000), false);
    assert.deepEqual(c.sets, [false]);
    assert.ok(c.ref.current === liveAt || (Number.isNaN(liveAt) && Number.isNaN(c.ref.current)));
  }
});

test('dropStaleLive with setBackDrops drops Live on a clock set back and waits for a reply', () => {
  const liveAt = 10_000_000;
  const ref = { current: liveAt };
  const sets = [];
  const run = (now, setBackDrops) => dropStaleLive({ liveAtRef: ref, now, setLive: (v) => sets.push(v), setBackDrops });
  // Foreground after the clock went back an hour: Live drops at once.
  const back = liveAt - 60 * 60 * 1000;
  assert.equal(run(back, true), false);
  assert.deepEqual(sets, [false]);
  assert.equal(ref.current, back);
  // Inside the grace and on a normal clock, setBackDrops changes nothing.
  const c = liveCheck(liveAt);
  assert.equal(dropStaleLive({ liveAtRef: c.ref, now: liveAt + 1000, setLive: (v) => c.sets.push(v), setBackDrops: true }), true);
  assert.deepEqual(c.sets, []);
  // Past the grace on a normal clock it still drops through the grace check.
  const g = liveCheck(liveAt);
  assert.equal(dropStaleLive({ liveAtRef: g.ref, now: liveAt + LIVE_GRACE_MS + 1, setLive: (v) => g.sets.push(v), setBackDrops: true }), false);
  assert.deepEqual(g.sets, [false]);
  // A miss after the drop keeps Live off and never turns it on.
  assert.equal(run(back + 1000, false), true);
  assert.ok(!sets.includes(true));
  // Nothing landed yet still just drops Live.
  const e = liveCheck(null);
  assert.equal(dropStaleLive({ liveAtRef: e.ref, now: 5_000, setLive: (v) => e.sets.push(v), setBackDrops: true }), false);
  assert.deepEqual(e.sets, [false]);
  assert.equal(e.ref.current, null);
});

test('a reply that goes stale during its save shows when the newer call fails', async () => {
  const s = screen();
  const saving = deferred();
  const later = deferred();
  const first = s.call(async () => good(4400), { save: () => saving.promise });
  await new Promise((r) => setImmediate(r));
  const second = s.call(() => later.promise);
  saving.resolve();
  assert.equal(await first, 'stale');
  assert.deepEqual(s.applied, []);
  later.reject(new Error('offline'));
  assert.equal(await second, 'applied');
  assert.deepEqual(s.applied.map((a) => a.reply.spots.gold), [4400]);
  assert.equal(s.source, 'test');
});

test('a held reply shows on a timeout or an empty reply too, and onMiss stays quiet', async () => {
  for (const fail of [() => Promise.reject(timeoutError()), async () => ({ prices: {} })]) {
    const gate = createLatestOnly();
    const shown = [];
    const heard = [];
    const saving = deferred();
    const call = (fetchRaw, save = async () => {}) => runSpotFetch({
      gate,
      fetchRaw,
      save,
      getSource: () => 'live',
      setSource: () => {},
      apply: (a) => shown.push(a.reply.spots.gold),
      onMiss: (o) => heard.push(o),
    });
    const first = call(async () => good(4400), () => saving.promise);
    await new Promise((r) => setImmediate(r));
    const later = deferred();
    const second = call(() => later.promise);
    saving.resolve();
    assert.equal(await first, 'stale');
    fail().then(later.resolve, later.reject);
    assert.equal(await second, 'applied');
    assert.deepEqual(shown, [4400]);
    assert.deepEqual(heard, []);
  }
});

test('a held reply never replaces a newer reply already on screen', async () => {
  const s = screen();
  const savingA = deferred();
  const a = s.call(async () => good(4400), { save: () => savingA.promise });
  await new Promise((r) => setImmediate(r));
  // B lands and shows while A is still saving.
  assert.equal(await s.call(async () => good(4600)), 'applied');
  savingA.resolve();
  assert.equal(await a, 'stale');
  // C fails, and A's older reply must not come back over B's.
  assert.equal(await s.call(async () => { throw new Error('offline'); }), 'failed');
  assert.deepEqual(s.applied.map((x) => x.reply.spots.gold), [4600]);
  assert.equal(s.source, 'cached');
});

test('a held reply shows once, and the newest held reply wins', async () => {
  const s = screen();
  const savingA = deferred();
  const savingB = deferred();
  const a = s.call(async () => good(4400), { save: () => savingA.promise });
  await new Promise((r) => setImmediate(r));
  const b = s.call(async () => good(4500), { save: () => savingB.promise });
  await new Promise((r) => setImmediate(r));
  const later = deferred();
  const c = s.call(() => later.promise);
  savingA.resolve();
  savingB.resolve();
  assert.equal(await a, 'stale');
  assert.equal(await b, 'stale');
  later.reject(new Error('offline'));
  assert.equal(await c, 'applied');
  assert.equal(await s.call(async () => { throw new Error('offline'); }), 'failed');
  assert.deepEqual(s.applied.map((x) => x.reply.spots.gold), [4500]);
});

test('a reply that went stale before its save is not held', async () => {
  const s = screen();
  const fetching = deferred();
  const first = s.call(() => fetching.promise);
  const later = deferred();
  const second = s.call(() => later.promise);
  fetching.resolve(good(4400));
  assert.equal(await first, 'stale');
  later.reject(new Error('offline'));
  assert.equal(await second, 'failed');
  assert.deepEqual(s.applied, []);
  assert.deepEqual(s.saves, []);
});

test('a held reply whose apply throws falls back to the miss', async () => {
  const gate = createLatestOnly();
  const heard = [];
  const saving = deferred();
  let source = 'live';
  const call = (fetchRaw, save = async () => {}) => runSpotFetch({
    gate,
    fetchRaw,
    save,
    getSource: () => source,
    setSource: (v) => { source = v; },
    apply: () => { throw new Error('render'); },
    onMiss: (o) => heard.push(o),
  });
  const first = call(async () => good(4400), () => saving.promise);
  await new Promise((r) => setImmediate(r));
  const later = deferred();
  const second = call(() => later.promise);
  saving.resolve();
  assert.equal(await first, 'stale');
  later.reject(new Error('offline'));
  assert.equal(await second, 'failed');
  assert.deepEqual(heard, ['failed']);
  assert.equal(source, 'cached');
});

test('a reply whose save ends after the newer call already missed shows right away, and is not held', async () => {
  const s = screen();
  const saving = deferred();
  const first = s.call(async () => good(4400), { save: () => saving.promise });
  await new Promise((r) => setImmediate(r));
  assert.equal(await s.call(async () => { throw new Error('offline'); }), 'failed');
  assert.equal(s.source, 'cached');
  saving.resolve();
  assert.equal(await first, 'applied');
  assert.deepEqual(s.applied.map((a) => a.reply.spots.gold), [4400]);
  // Nothing lingers to bring old prices back on a later miss.
  assert.equal(await s.call(async () => { throw new Error('offline'); }), 'failed');
  assert.deepEqual(s.applied.map((a) => a.reply.spots.gold), [4400]);
  assert.equal(s.source, 'cached');
});

test('a reply whose save ends while the newest call is still out is held, not shown', async () => {
  const s = screen();
  const saving = deferred();
  const first = s.call(async () => good(4400), { save: () => saving.promise });
  await new Promise((r) => setImmediate(r));
  assert.equal(await s.call(async () => { throw new Error('offline'); }), 'failed');
  // A third call is out now, so the second call's miss no longer owns the screen.
  const later = deferred();
  const third = s.call(() => later.promise);
  saving.resolve();
  assert.equal(await first, 'stale');
  assert.deepEqual(s.applied, []);
  later.resolve(good(4700));
  assert.equal(await third, 'applied');
  assert.deepEqual(s.applied.map((a) => a.reply.spots.gold), [4700]);
});

test('apply gets the clock time the reply landed', async () => {
  const gate = createLatestOnly();
  const got = [];
  await runSpotFetch({
    gate, fetchRaw: async () => good(), save: async () => {},
    getSource: () => 'live', setSource: () => {}, apply: (a) => got.push(a.landedAt), clock: () => 1234,
  });
  assert.deepEqual(got, [1234]);
});

// A screen whose clock the test moves by hand.
const clocked = () => {
  const gate = createLatestOnly();
  const c = { t: 1_000_000, shown: [], heard: [] };
  c.call = (fetchRaw, save = async () => {}) => runSpotFetch({
    gate, fetchRaw, save,
    getSource: () => 'live', setSource: () => {},
    apply: (a) => c.shown.push([a.reply.spots.gold, a.landedAt]),
    onMiss: (o) => c.heard.push(o),
    clock: () => c.t,
  });
  return c;
};

test('a held reply carries its landing time, not the time it finally shows', async () => {
  const c = clocked();
  const saving = deferred();
  const first = c.call(async () => good(4400), () => saving.promise);
  await new Promise((r) => setImmediate(r));
  const later = deferred();
  const second = c.call(() => later.promise);
  saving.resolve();
  assert.equal(await first, 'stale');
  c.t += 8000;
  later.reject(timeoutError());
  assert.equal(await second, 'applied');
  assert.deepEqual(c.shown, [[4400, 1_000_000]]);
});

test('a held reply past the grace never shows, even through a newer call that went stale', async () => {
  const c = clocked();
  const saving = deferred();
  const a = c.call(async () => good(4400), () => saving.promise);
  await new Promise((r) => setImmediate(r));
  // C is out when A's save ends, so A is held. Then the app sleeps.
  const outC = deferred();
  const callC = c.call(() => outC.promise);
  saving.resolve();
  assert.equal(await a, 'stale');
  c.t += LIVE_GRACE_MS + 1;
  // On foreground D starts, C goes stale, and D fails.
  const outD = deferred();
  const callD = c.call(() => outD.promise);
  outC.reject(timeoutError());
  assert.equal(await callC, 'stale');
  outD.reject(new Error('offline'));
  assert.equal(await callD, 'failed');
  assert.deepEqual(c.shown, []);
  assert.deepEqual(c.heard, ['failed']);
});

test('a newer reply whose save ends after a held one showed still shows', async () => {
  const c = clocked();
  const savingA = deferred();
  const savingB = deferred();
  const a = c.call(async () => good(4400), () => savingA.promise);
  await new Promise((r) => setImmediate(r));
  const b = c.call(async () => good(4500), () => savingB.promise);
  await new Promise((r) => setImmediate(r));
  const out = deferred();
  const third = c.call(() => out.promise);
  savingA.resolve();
  assert.equal(await a, 'stale');
  out.reject(new Error('offline'));
  assert.equal(await third, 'applied');
  savingB.resolve();
  assert.equal(await b, 'applied');
  assert.deepEqual(c.shown.map(([g]) => g), [4400, 4500]);
});

test('a newest reply whose apply throws does not let an older held reply show', async () => {
  const gate = createLatestOnly();
  const shown = [];
  const saving = deferred();
  const call = (fetchRaw, { save = async () => {}, apply } = {}) => runSpotFetch({
    gate, fetchRaw, save, getSource: () => 'live', setSource: () => {},
    apply: apply || ((x) => shown.push(x.reply.spots.gold)),
  });
  const a = call(async () => good(4400), { save: () => saving.promise });
  await new Promise((r) => setImmediate(r));
  const out = deferred();
  const b = call(() => out.promise, { apply: () => { throw new Error('render'); } });
  saving.resolve();
  assert.equal(await a, 'stale');
  out.resolve(good(4600));
  assert.equal(await b, 'failed');
  assert.deepEqual(shown, []);
});

test('landedAt is read when the reply comes in, not after its save', async () => {
  const c = clocked();
  const saving = deferred();
  const call = c.call(async () => good(4400), () => saving.promise);
  await new Promise((r) => setImmediate(r));
  // The save runs long (or the app sleeps through it).
  c.t += 9000;
  saving.resolve();
  assert.equal(await call, 'applied');
  assert.deepEqual(c.shown, [[4400, 1_000_000]]);
});

test('a save that outlasts the grace hands apply a landing past the grace', async () => {
  const c = clocked();
  const saving = deferred();
  const call = c.call(async () => good(4400), () => saving.promise);
  await new Promise((r) => setImmediate(r));
  c.t += LIVE_GRACE_MS + 1;
  saving.resolve();
  assert.equal(await call, 'applied');
  const [[, landedAt]] = c.shown;
  assert.equal(keepsLive({ liveAt: landedAt, now: c.t }), false);
});

test('a held reply past the grace by its landing never shows, though its save ended inside it', async () => {
  const c = clocked();
  const saving = deferred();
  const a = c.call(async () => good(4400), () => saving.promise);
  await new Promise((r) => setImmediate(r));
  const out = deferred();
  const b = c.call(() => out.promise);
  c.t += LIVE_GRACE_MS - 1000;
  saving.resolve();
  assert.equal(await a, 'stale');
  c.t += 2000;
  out.reject(timeoutError());
  assert.equal(await b, 'timeout');
  assert.deepEqual(c.shown, []);
  assert.deepEqual(c.heard, ['timeout']);
});

test('a held reply never shows once the clock moved back past its landing', async () => {
  const c = clocked();
  const saving = deferred();
  const a = c.call(async () => good(4400), () => saving.promise);
  await new Promise((r) => setImmediate(r));
  const out = deferred();
  const b = c.call(() => out.promise);
  saving.resolve();
  assert.equal(await a, 'stale');
  c.t -= 60 * 60 * 1000;
  out.reject(new Error('offline'));
  assert.equal(await b, 'failed');
  assert.deepEqual(c.shown, []);
  assert.deepEqual(c.heard, ['failed']);
});

test('a held reply still shows on the same clock tick it landed', async () => {
  const c = clocked();
  const saving = deferred();
  const a = c.call(async () => good(4400), () => saving.promise);
  await new Promise((r) => setImmediate(r));
  const out = deferred();
  const b = c.call(() => out.promise);
  saving.resolve();
  assert.equal(await a, 'stale');
  out.reject(new Error('offline'));
  assert.equal(await b, 'applied');
  assert.deepEqual(c.shown, [[4400, 1_000_000]]);
});

test('a held reply still shows after a time sync nudges the clock back a few ms', async () => {
  const c = clocked();
  const saving = deferred();
  const a = c.call(async () => good(4400), () => saving.promise);
  await new Promise((r) => setImmediate(r));
  const out = deferred();
  const b = c.call(() => out.promise);
  saving.resolve();
  assert.equal(await a, 'stale');
  c.t -= 5;
  out.reject(new Error('offline'));
  assert.equal(await b, 'applied');
  assert.deepEqual(c.shown, [[4400, 1_000_000]]);
});

test('a held reply still shows at exactly the tolerance and drops just past it', async () => {
  for (const [back, want] of [[SET_BACK_TOLERANCE_MS, 'applied'], [SET_BACK_TOLERANCE_MS + 1, 'failed']]) {
    const c = clocked();
    const saving = deferred();
    const a = c.call(async () => good(4400), () => saving.promise);
    await new Promise((r) => setImmediate(r));
    const out = deferred();
    const b = c.call(() => out.promise);
    saving.resolve();
    assert.equal(await a, 'stale');
    c.t -= back;
    out.reject(new Error('offline'));
    assert.equal(await b, want);
    assert.equal(c.shown.length, want === 'applied' ? 1 : 0);
  }
});

test('setBackPast counts only a step back past the tolerance', () => {
  assert.equal(setBackPast({ at: 10_000, now: 10_000 }), false);
  assert.equal(setBackPast({ at: 10_000, now: 10_000 - SET_BACK_TOLERANCE_MS }), false);
  assert.equal(setBackPast({ at: 10_000, now: 10_000 - SET_BACK_TOLERANCE_MS - 1 }), true);
  assert.equal(setBackPast({ at: 10_000, now: 20_000 }), false);
  for (const at of [null, undefined, NaN, Infinity]) assert.equal(setBackPast({ at, now: 0 }), false);
});

test('dropStaleLive with setBackDrops keeps Live through a time sync nudge', () => {
  const liveAt = 10_000_000;
  const c = liveCheck(liveAt);
  assert.equal(dropStaleLive({ liveAtRef: c.ref, now: liveAt - 5, setLive: (v) => c.sets.push(v), setBackDrops: true }), true);
  assert.deepEqual(c.sets, []);
  assert.equal(c.ref.current, liveAt);
  // A real set-back still drops it.
  assert.equal(dropStaleLive({ liveAtRef: c.ref, now: liveAt - SET_BACK_TOLERANCE_MS - 1, setLive: (v) => c.sets.push(v), setBackDrops: true }), false);
  assert.deepEqual(c.sets, [false]);
});
