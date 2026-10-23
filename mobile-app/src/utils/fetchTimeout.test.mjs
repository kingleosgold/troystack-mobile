// Run with: node --test mobile-app/src/utils/fetchTimeout.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fetchWithTimeout, REST_TIMEOUT_MS } from './fetchTimeout.js';

const REST = 'https://x.supabase.co/rest/v1/holdings?select=*';
const AUTH = 'https://x.supabase.co/auth/v1/token?grant_type=refresh_token';

const abortError = () => {
  const err = new Error('Aborted');
  err.name = 'AbortError';
  return err;
};

// A fetch that never answers until its signal aborts, like a stalled socket.
const stalled = () => {
  const calls = [];
  const impl = (input, init) => {
    calls.push({ input, init });
    return new Promise((_, reject) => {
      // Like fetch, a signal that's already aborted rejects at once.
      if (init?.signal?.aborted) reject(abortError());
      else init?.signal?.addEventListener('abort', () => reject(abortError()));
    });
  };
  return { impl, calls };
};

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

const pendingFor = async (promise, ms) => {
  let settled = false;
  promise.then(() => { settled = true; }, () => { settled = true; });
  await tick(ms);
  return !settled;
};

test('the limit is 30 seconds', () => {
  assert.equal(REST_TIMEOUT_MS, 30000);
});

test('a stalled REST read aborts at the limit', async () => {
  const { impl } = stalled();
  const started = Date.now();
  await assert.rejects(fetchWithTimeout(impl, 20)(REST, { method: 'GET' }), { name: 'AbortError' });
  assert.ok(Date.now() - started >= 15);
});

test('a read with no method counts as a GET', async () => {
  const { impl } = stalled();
  await assert.rejects(fetchWithTimeout(impl, 10)(REST), { name: 'AbortError' });
});

test('a stalled HEAD count aborts at the limit', async () => {
  const { impl } = stalled();
  await assert.rejects(fetchWithTimeout(impl, 10)(REST, { method: 'HEAD' }), { name: 'AbortError' });
});

test('a body that stalls after the headers aborts too', async () => {
  const impl = async (_, init) => ({
    status: 200,
    statusText: 'OK',
    headers: new Headers(),
    text: () => new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => reject(abortError()));
    }),
  });
  await assert.rejects(fetchWithTimeout(impl, 10)(REST, { method: 'GET' }), { name: 'AbortError' });
});

test('a read answered inside the limit keeps its status, headers, body and init', async () => {
  let seen;
  const impl = async (input, init) => {
    seen = { input, init };
    return new Response('[{"id":1}]', {
      status: 206, statusText: 'Partial Content', headers: { 'content-range': '0-0/5' },
    });
  };
  const headers = new Headers({ apikey: 'k' });
  const res = await fetchWithTimeout(impl, 1000)(REST, { method: 'GET', headers });
  assert.equal(res.status, 206);
  assert.equal(res.statusText, 'Partial Content');
  assert.equal(res.ok, true);
  assert.equal(res.headers.get('content-range'), '0-0/5');
  assert.equal(await res.text(), '[{"id":1}]');
  assert.equal(seen.input, REST);
  assert.equal(seen.init.headers, headers);
  assert.ok(seen.init.signal);
});

test('an error answer passes through as itself', async () => {
  const impl = async () => new Response('{"code":"PGRST116"}', { status: 406 });
  const res = await fetchWithTimeout(impl, 1000)(REST, { method: 'GET' });
  assert.equal(res.status, 406);
  assert.equal(res.ok, false);
  assert.equal(await res.text(), '{"code":"PGRST116"}');
});

test('a 204 answer comes back with no body', async () => {
  const impl = async () => new Response(null, { status: 204 });
  const res = await fetchWithTimeout(impl, 1000)(REST, { method: 'GET' });
  assert.equal(res.status, 204);
  assert.equal(await res.text(), '');
});

test('an answered read does not abort later', async () => {
  let signal;
  const impl = async (_, init) => { signal = init.signal; return new Response('[]'); };
  await fetchWithTimeout(impl, 10)(REST, {});
  await tick(30);
  assert.equal(signal.aborted, false);
});

for (const method of ['POST', 'PATCH', 'DELETE', 'post']) {
  test(`a REST ${method} gets no limit and keeps its own init`, async () => {
    const { impl, calls } = stalled();
    const init = { method, body: '[]' };
    const pending = fetchWithTimeout(impl, 10)(REST, init);
    assert.equal(await pendingFor(pending, 30), true);
    assert.equal(calls[0].init, init);
    assert.equal(calls[0].init.signal, undefined);
  });
}

test('an auth request gets no limit', async () => {
  const { impl, calls } = stalled();
  const init = { method: 'GET' };
  const pending = fetchWithTimeout(impl, 10)(AUTH, init);
  assert.equal(await pendingFor(pending, 30), true);
  assert.equal(calls[0].init, init);
});

test("a caller's abort still aborts a read", async () => {
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

test('a Request-like input is matched by its url and method', async () => {
  const { impl } = stalled();
  await assert.rejects(fetchWithTimeout(impl, 10)({ url: REST, method: 'GET' }), { name: 'AbortError' });
  const post = fetchWithTimeout(impl, 10)({ url: REST, method: 'POST' });
  assert.equal(await pendingFor(post, 30), true);
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

// A read the limit cuts short must not read as a holding missing from the
// cloud, or an edit adds it twice and a delete skips the row.
test('findHoldingByLocalId throws on a failed read instead of returning not found', () => {
  const src = readFileSync(new URL('../services/supabaseHoldings.ts', import.meta.url), 'utf8');
  const start = src.indexOf('export async function findHoldingByLocalId(');
  const fn = src.slice(start, src.indexOf('\n}\n', start));
  const handler = fn.slice(fn.lastIndexOf('} catch (err) {'));
  assert.match(handler, /throw err;/);
  assert.doesNotMatch(handler, /return null;/);
});

test('both callers of findHoldingByLocalId sit inside a try that catches', () => {
  const app = readFileSync(new URL('../../App.js', import.meta.url), 'utf8');
  let at = app.indexOf('await findHoldingByLocalId(');
  let seen = 0;
  while (at !== -1) {
    seen += 1;
    const before = app.slice(Math.max(0, at - 2500), at);
    const after = app.slice(at, at + 2500);
    assert.ok(before.lastIndexOf('try {') > before.lastIndexOf('} catch'), 'lookup sits in a try');
    assert.match(after, /\} catch \(err\) \{/);
    at = app.indexOf('await findHoldingByLocalId(', at + 1);
  }
  assert.equal(seen, 2);
});
