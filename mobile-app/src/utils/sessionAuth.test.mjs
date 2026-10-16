import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionAuthHeader } from './sessionAuth.js';

const signedIn = (token) => async () => ({ data: { session: { access_token: token, user: { id: 'u1' } } } });

test('signed in, the call carries the session token as a Bearer header', async () => {
  assert.deepEqual(await sessionAuthHeader({ getSession: signedIn('aaa.bbb.ccc') }), { Authorization: 'Bearer aaa.bbb.ccc' });
});

test('signed out, the call carries nothing', async () => {
  assert.deepEqual(await sessionAuthHeader({ getSession: async () => ({ data: { session: null } }) }), {});
  assert.deepEqual(await sessionAuthHeader({ getSession: async () => ({}) }), {});
  assert.deepEqual(await sessionAuthHeader({ getSession: signedIn('') }), {});
});

test('a session read that fails or hangs sends nothing, so the call still goes', async () => {
  assert.deepEqual(await sessionAuthHeader({ getSession: async () => { throw new Error('storage'); } }), {});
  const hangs = () => new Promise(() => {});
  assert.deepEqual(await sessionAuthHeader({ getSession: hangs, timeoutMs: 20 }), {});
});
