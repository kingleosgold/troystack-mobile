import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteAccount } from './accountDelete.js';

const API = 'https://api.example.test';

function answer(status, body) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (status instanceof Error) throw status;
    return { status, json: async () => body };
  };
  return { calls, fetchImpl };
}

test('the request is a DELETE to the account route with the session token and no body', async () => {
  const { calls, fetchImpl } = answer(200, { deleted: true });
  assert.deepEqual(await deleteAccount({ apiBase: API, token: 'tok', fetchImpl }), { kind: 'deleted' });
  assert.equal(calls[0].url, `${API}/v1/account`);
  assert.equal(calls[0].init.method, 'DELETE');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok');
  assert.equal(calls[0].init.body, undefined);
});

test('no token or a 401 asks the person to sign in again, and nothing is sent without a token', async () => {
  const { calls, fetchImpl } = answer(200, {});
  assert.deepEqual(await deleteAccount({ apiBase: API, token: null, fetchImpl }), { kind: 'expired' });
  assert.equal(calls.length, 0);
  assert.deepEqual(await deleteAccount({ apiBase: API, token: 'tok', fetchImpl: answer(401, {}).fetchImpl }), { kind: 'expired' });
});

test('a 409 passes on the API message about cancelling the troystack.ai plan', async () => {
  const message = 'Cancel your Gold plan in Settings on troystack.ai first.';
  const result = await deleteAccount({ apiBase: API, token: 'tok', fetchImpl: answer(409, { error: 'stripe_plan_active', message }).fetchImpl });
  assert.deepEqual(result, { kind: 'plan', message });
});

test('a 503, a 500, a body that is not JSON or no connection reads as try again', async () => {
  const fromApi = await deleteAccount({ apiBase: API, token: 'tok', fetchImpl: answer(503, { error: 'Your plan could not be checked.' }).fetchImpl });
  assert.deepEqual(fromApi, { kind: 'retry', message: 'Your plan could not be checked.' });
  const notJson = { fetchImpl: async () => ({ status: 500, json: async () => { throw new Error('html'); } }) };
  assert.equal((await deleteAccount({ apiBase: API, token: 'tok', ...notJson })).kind, 'retry');
  assert.equal((await deleteAccount({ apiBase: API, token: 'tok', fetchImpl: answer(new Error('offline')).fetchImpl })).kind, 'retry');
});

test('a slow answer times out as try again', async () => {
  const fetchImpl = (url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('aborted')));
  });
  assert.equal((await deleteAccount({ apiBase: API, token: 'tok', fetchImpl, timeoutMs: 20 })).kind, 'retry');
});
