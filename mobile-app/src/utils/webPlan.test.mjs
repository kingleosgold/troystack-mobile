// Run with: node --test mobile-app/src/utils/webPlan.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { cacheWebPlan, fetchWebPlan, mergePlans, readCachedWebPlan, shouldRecheckWebPlan, webPlanCacheKey, withTimeout } from './webPlan.js';

const API = 'https://api.example.test';

function answer(status, body) {
  return async () => ({ ok: status >= 200 && status < 300, status, json: async () => body });
}

test('a web trial or subscription reads as gold, lifetime as lifetime', async () => {
  assert.equal(await fetchWebPlan({ apiBase: API, token: 't', fetchImpl: answer(200, { plan: 'gold', status: 'trialing' }) }), 'gold');
  assert.equal(await fetchWebPlan({ apiBase: API, token: 't', fetchImpl: answer(200, { plan: 'lifetime' }) }), 'lifetime');
});

test('Stripe having nothing reads as null, so the app may write free', async () => {
  assert.equal(await fetchWebPlan({ apiBase: API, token: 't', fetchImpl: answer(200, { plan: null }) }), null);
});

test("anything that can't tell reads as undefined, so the profile is left alone", async () => {
  assert.equal(await fetchWebPlan({ apiBase: API, token: null, fetchImpl: answer(200, { plan: 'gold' }) }), undefined);
  assert.equal(await fetchWebPlan({ apiBase: API, token: 't', fetchImpl: answer(404, { error: 'Not found' }) }), undefined);
  assert.equal(await fetchWebPlan({ apiBase: API, token: 't', fetchImpl: answer(500, {}) }), undefined);
  assert.equal(await fetchWebPlan({ apiBase: API, token: 't', fetchImpl: answer(200, { something: 'else' }) }), undefined);
  assert.equal(
    await fetchWebPlan({ apiBase: API, token: 't', fetchImpl: async () => { throw new Error('offline'); } }),
    undefined,
  );
});

test('a slow answer times out as undefined', async () => {
  const slow = (url, { signal }) =>
    new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')));
    });
  assert.equal(await fetchWebPlan({ apiBase: API, token: 't', fetchImpl: slow, timeoutMs: 20 }), undefined);
});

test('the request carries the session token to the right route', async () => {
  let seen;
  await fetchWebPlan({
    apiBase: API,
    token: 'session-token',
    fetchImpl: async (url, init) => {
      seen = { url, auth: init.headers.Authorization };
      return { ok: true, status: 200, json: async () => ({ plan: null }) };
    },
  });
  assert.deepEqual(seen, { url: `${API}/v1/stripe/my-plan`, auth: 'Bearer session-token' });
});

test('a web plan adds Gold on top of RevenueCat and never takes it away', () => {
  assert.deepEqual(mergePlans({ rcGold: false, rcLifetime: false, rcTier: 'free', webPlan: 'gold' }), { hasGold: true, hasLifetime: false, tier: 'gold' });
  assert.deepEqual(mergePlans({ rcGold: false, rcLifetime: false, rcTier: 'free', webPlan: 'lifetime' }), { hasGold: true, hasLifetime: true, tier: 'gold' });
  assert.deepEqual(mergePlans({ rcGold: true, rcLifetime: false, rcTier: 'gold', webPlan: null }), { hasGold: true, hasLifetime: false, tier: 'gold' });
  assert.deepEqual(mergePlans({ rcGold: false, rcLifetime: false, rcTier: 'free', webPlan: null }), { hasGold: false, hasLifetime: false, tier: 'free' });
});

function memoryStorage() {
  const data = new Map();
  return {
    data,
    getItem: async (key) => (data.has(key) ? data.get(key) : null),
    setItem: async (key, value) => {
      data.set(key, value);
    },
  };
}

test('a confirmed answer is kept per account and read back', async () => {
  const storage = memoryStorage();
  await cacheWebPlan(storage, 'user-a', 'gold');
  await cacheWebPlan(storage, 'user-b', null);
  assert.equal(await readCachedWebPlan(storage, 'user-a'), 'gold');
  assert.equal(await readCachedWebPlan(storage, 'user-b'), null, 'a confirmed none reads as no plan');
  assert.equal(storage.data.get(webPlanCacheKey('user-b')), 'none');
  assert.equal(await readCachedWebPlan(storage, 'user-c'), null);
});

test("an answer that couldn't tell is never cached, and a broken store reads as no plan", async () => {
  const storage = memoryStorage();
  await cacheWebPlan(storage, 'user-a', 'lifetime');
  await cacheWebPlan(storage, 'user-a', undefined);
  assert.equal(await readCachedWebPlan(storage, 'user-a'), 'lifetime');
  const broken = { getItem: async () => { throw new Error('disk'); }, setItem: async () => { throw new Error('disk'); } };
  await cacheWebPlan(broken, 'user-a', 'gold');
  assert.equal(await readCachedWebPlan(broken, 'user-a'), null);
});

test('the foreground asks again only while RevenueCat has nothing, and not too often', () => {
  const now = 10 * 60 * 60 * 1000;
  assert.equal(shouldRecheckWebPlan({ now, lastAt: now - 5 * 60_000, lastAnswered: true, rcHasPlan: true }), false, 'an App Store plan needs no web check');
  assert.equal(shouldRecheckWebPlan({ now, lastAt: now - 5 * 60_000, lastAnswered: true, rcHasPlan: false }), false);
  assert.equal(shouldRecheckWebPlan({ now, lastAt: now - 16 * 60_000, lastAnswered: true, rcHasPlan: false }), true);
  assert.equal(shouldRecheckWebPlan({ now, lastAt: now - 30_000, lastAnswered: false, rcHasPlan: false }), false);
  assert.equal(shouldRecheckWebPlan({ now, lastAt: now - 61_000, lastAnswered: false, rcHasPlan: false }), true, 'a check that failed is tried again after a minute');
  assert.equal(shouldRecheckWebPlan({ now, lastAt: 0, lastAnswered: false, rcHasPlan: false }), true);
});

test('a slow step gives up after its time', async () => {
  assert.equal(await withTimeout(Promise.resolve('fast'), 50), 'fast');
  await assert.rejects(withTimeout(new Promise(() => {}), 20), /Timed out/);
});
