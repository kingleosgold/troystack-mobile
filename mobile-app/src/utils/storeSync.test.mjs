// Run with: node --test mobile-app/src/utils/storeSync.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { oncePerAccount, requestStoreSync, strongerPlan, syncStorePlanFor } from './storeSync.js';

const API = 'https://api.example.test';

function answer(status, body) {
  return async () => ({ ok: status >= 200 && status < 300, status, json: async () => body });
}

test('the request posts to the sync route with the session token and no body', async () => {
  let seen;
  await requestStoreSync({
    apiBase: API,
    token: 'session-token',
    fetchImpl: async (url, init) => {
      seen = { url, method: init.method, auth: init.headers.Authorization, body: init.body };
      return { ok: true, status: 200, json: async () => ({ success: true, tier: 'free', expires_at: null }) };
    },
  });
  assert.deepEqual(seen, { url: `${API}/v1/revenuecat/sync`, method: 'POST', auth: 'Bearer session-token', body: undefined });
});

test('a 200 carries the plan the server wrote', async () => {
  assert.deepEqual(
    await requestStoreSync({ apiBase: API, token: 't', fetchImpl: answer(200, { success: true, tier: 'gold', expires_at: '2026-11-09T00:00:00.000Z' }) }),
    { kind: 'plan', tier: 'gold', expiresAt: '2026-11-09T00:00:00.000Z' },
  );
  assert.deepEqual(
    await requestStoreSync({ apiBase: API, token: 't', fetchImpl: answer(200, { success: true, tier: 'lifetime', expires_at: null }) }),
    { kind: 'plan', tier: 'lifetime', expiresAt: null },
  );
  assert.deepEqual(
    await requestStoreSync({ apiBase: API, token: 't', fetchImpl: answer(200, { success: true, tier: 'free', expires_at: null }) }),
    { kind: 'plan', tier: 'free', expiresAt: null },
  );
  assert.deepEqual(
    await requestStoreSync({ apiBase: API, token: 't', fetchImpl: answer(200, { success: true, tier: 'platinum' }) }),
    { kind: 'retry' },
    'an answer the app does not understand is tried again next launch',
  );
});

test('every other status means what the contract says', async () => {
  const kind = async (status) => (await requestStoreSync({ apiBase: API, token: 't', fetchImpl: answer(status, { error: 'x' }) })).kind;
  assert.equal(await kind(401), 'expired');
  assert.equal(await kind(404), 'not-ready', 'route not deployed yet');
  assert.equal(await kind(503), 'not-ready', 'no RevenueCat key on the server yet');
  assert.equal(await kind(429), 'retry');
  assert.equal(await kind(500), 'retry');
  assert.deepEqual(await requestStoreSync({ apiBase: API, token: null, fetchImpl: answer(200, {}) }), { kind: 'expired' }, 'no session token');
  assert.deepEqual(
    await requestStoreSync({ apiBase: API, token: 't', fetchImpl: async () => { throw new Error('offline'); } }),
    { kind: 'retry' },
  );
});

test('a slow sync gives up and is tried again next launch', async () => {
  const slow = (url, { signal }) =>
    new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')));
    });
  assert.deepEqual(await requestStoreSync({ apiBase: API, token: 't', fetchImpl: slow, timeoutMs: 20 }), { kind: 'retry' });
});

function session(userId) {
  return async () => ({ data: { session: userId ? { access_token: `token-${userId}`, user: { id: userId } } : null } });
}

test("an account's sync shows its plan only while that account is signed in", async () => {
  const gold = answer(200, { success: true, tier: 'gold', expires_at: null });
  assert.equal(await syncStorePlanFor({ userId: 'user-a', getSession: session('user-a'), stillSignedIn: () => true, apiBase: API, fetchImpl: gold }), 'gold');
  assert.equal(
    await syncStorePlanFor({ userId: 'user-a', getSession: session('user-a'), stillSignedIn: (id) => id === 'user-b', apiBase: API, fetchImpl: gold }),
    undefined,
    'the answer came back after a switch to another account',
  );
  assert.equal(
    await syncStorePlanFor({ userId: 'user-a', getSession: session('user-a'), stillSignedIn: () => true, apiBase: API, fetchImpl: answer(200, { success: true, tier: 'free', expires_at: null }) }),
    null,
    'free shows as no plan from the server',
  );
  assert.equal(
    await syncStorePlanFor({ userId: 'user-a', getSession: session('user-a'), stillSignedIn: () => true, apiBase: API, fetchImpl: answer(404, {}) }),
    undefined,
  );
});

test("the sync never asks with another account's session, or with none", async () => {
  let asked = 0;
  const counting = async () => {
    asked += 1;
    return { ok: true, status: 200, json: async () => ({ success: true, tier: 'gold', expires_at: null }) };
  };
  assert.equal(await syncStorePlanFor({ userId: 'user-a', getSession: session('user-b'), stillSignedIn: () => true, apiBase: API, fetchImpl: counting }), undefined);
  assert.equal(await syncStorePlanFor({ userId: 'user-a', getSession: session(null), stillSignedIn: () => true, apiBase: API, fetchImpl: counting }), undefined);
  assert.equal(
    await syncStorePlanFor({ userId: 'user-a', getSession: async () => { throw new Error('Timed out'); }, stillSignedIn: () => true, apiBase: API, fetchImpl: counting }),
    undefined,
  );
  assert.equal(asked, 0);
});

test("the server's plan adds to the others the way a web plan does", () => {
  assert.equal(strongerPlan(null, null), null);
  assert.equal(strongerPlan('gold', null), 'gold');
  assert.equal(strongerPlan(null, 'gold'), 'gold');
  assert.equal(strongerPlan('gold', 'lifetime'), 'lifetime');
  assert.equal(strongerPlan('lifetime', null), 'lifetime');
});

test('the sync after sign-in runs once per account per launch', () => {
  const claim = oncePerAccount();
  assert.equal(claim('user-a'), true);
  assert.equal(claim('user-a'), false);
  assert.equal(claim('user-b'), true);
  assert.equal(claim(null), false);
});
