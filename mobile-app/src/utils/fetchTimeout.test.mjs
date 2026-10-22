// Run with: node --test mobile-app/src/utils/fetchTimeout.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fetchWithTimeout, REST_TIMEOUT_MS } from './fetchTimeout.js';

const REST = 'https://x.supabase.co/rest/v1/holdings?select=*';
const AUTH = 'https://x.supabase.co/auth/v1/token?grant_type=refresh_token';

// A fetch that never answers until its signal aborts, like a stalled socket.
const stalled = () => {
  const calls = [];
  const impl = (input, init) => {
    calls.push({ input, init });
    return new Promise((_, reject) => {
      const abort = () => {
        const err = new Error('Aborted');
        err.name = 'AbortError';
        reject(err);
      };
      // Like fetch, a signal that's already aborted rejects at once.
      if (init?.signal?.aborted) abort();
      else init?.signal?.addEventListener('abort', abort);
    });
  };
  return { impl, calls };
};

test('the limit is 30 seconds', () => {
  assert.equal(REST_TIMEOUT_MS, 30000);
});

test('a stalled REST request aborts at the limit', async () => {
  const { impl } = stalled();
  const started = Date.now();
  await assert.rejects(fetchWithTimeout(impl, 20)(REST, { method: 'GET' }), { name: 'AbortError' });
  assert.ok(Date.now() - started >= 15);
});

test('a REST answer inside the limit passes through with its init', async () => {
  const res = { ok: true };
  let seen;
  const impl = async (input, init) => { seen = { input, init }; return res; };
  const out = await fetchWithTimeout(impl, 1000)(REST, { method: 'POST', headers: { a: '1' }, body: 'x' });
  assert.equal(out, res);
  assert.equal(seen.input, REST);
  assert.equal(seen.init.method, 'POST');
  assert.deepEqual(seen.init.headers, { a: '1' });
  assert.equal(seen.init.body, 'x');
  assert.ok(seen.init.signal);
});

test('an answered request does not abort later', async () => {
  let signal;
  const impl = async (_, init) => { signal = init.signal; return { ok: true }; };
  await fetchWithTimeout(impl, 10)(REST, {});
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(signal.aborted, false);
});

test('auth requests get no limit and keep their own init', async () => {
  const { impl, calls } = stalled();
  const init = { method: 'POST' };
  const pending = fetchWithTimeout(impl, 10)(AUTH, init);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(calls[0].init, init);
  assert.equal(calls[0].init.signal, undefined);
  let settled = false;
  pending.then(() => { settled = true; }, () => { settled = true; });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(settled, false);
});

test("a caller's abort still aborts a REST request", async () => {
  const { impl } = stalled();
  const outer = new AbortController();
  const pending = fetchWithTimeout(impl, 10000)(REST, { signal: outer.signal });
  outer.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});

test('a signal already aborted aborts at once', async () => {
  const { impl } = stalled();
  const outer = new AbortController();
  outer.abort();
  await assert.rejects(fetchWithTimeout(impl, 10000)(REST, { signal: outer.signal }), { name: 'AbortError' });
});

test('a Request-like input is matched by its url', async () => {
  const { impl } = stalled();
  await assert.rejects(fetchWithTimeout(impl, 10)({ url: REST }, {}), { name: 'AbortError' });
});

test('a network error passes through', async () => {
  const impl = async () => { throw new TypeError('Network request failed'); };
  await assert.rejects(fetchWithTimeout(impl, 1000)(REST, {}), TypeError);
});

test('the Supabase client is built with the timed fetch', () => {
  const src = readFileSync(new URL('../lib/supabase.ts', import.meta.url), 'utf8');
  assert.match(src, /import \{ fetchWithTimeout \} from '\.\.\/utils\/fetchTimeout';/);
  assert.match(src, /global:\s*\{\s*fetch:\s*fetchWithTimeout\(\),?\s*\}/);
});
