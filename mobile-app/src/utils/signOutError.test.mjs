// Run with: node --test mobile-app/src/utils/signOutError.test.mjs
// Supabase's sign out needs the server, so offline it fails and the phone
// stays signed in. The alert says why.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { signOutFailMessage } from './signOutError.js';

const OFFLINE = "Couldn't reach TroyStack, so you're still signed in. Check your connection and try again.";

test('no connection says so', () => {
  assert.equal(signOutFailMessage({ name: 'AuthRetryableFetchError', status: 0, message: 'Network request failed' }), OFFLINE);
  assert.equal(signOutFailMessage({ name: 'AuthRetryableFetchError', status: 503, message: 'Service Unavailable' }), OFFLINE);
  assert.equal(signOutFailMessage(new TypeError('Network request failed')), OFFLINE);
  assert.equal(signOutFailMessage(new TypeError('Failed to fetch')), OFFLINE);
});

test('anything else keeps the plain words', () => {
  assert.equal(signOutFailMessage({ name: 'AuthApiError', status: 500, message: 'boom' }), 'Failed to sign out. Please try again.');
  assert.equal(signOutFailMessage(null), 'Failed to sign out. Please try again.');
  assert.equal(signOutFailMessage(undefined), 'Failed to sign out. Please try again.');
});

test('the auth context uses it for both failures', () => {
  const context = readFileSync(new URL('../contexts/AuthContext.tsx', import.meta.url), 'utf8');
  const start = context.indexOf('const signOut = useCallback(');
  const body = context.slice(start, context.indexOf('const resetPassword = useCallback(', start));
  assert.equal(body.match(/Alert\.alert\('Error', signOutFailMessage\(error\)\);/g).length, 2);
  assert.doesNotMatch(body, /Failed to sign out/);
});

test('a sign out that ended the session anyway counts as signed out', () => {
  const context = readFileSync(new URL('../contexts/AuthContext.tsx', import.meta.url), 'utf8');
  const start = context.indexOf('const signOut = useCallback(');
  const body = context.slice(start, context.indexOf('const resetPassword = useCallback(', start));
  const check = body.indexOf('if (left && !left.error && !left.data?.session) return { error: null };');
  assert.ok(check >= 0);
  assert.ok(check < body.indexOf("Alert.alert('Error', signOutFailMessage(error));"), 'no alert for a session that already ended');
});
