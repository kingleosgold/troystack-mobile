import test from 'node:test';
import assert from 'node:assert/strict';
import { readOAuthRedirect, SIGN_IN_CANCELLED } from './oauthRedirect.js';

const base = 'stacktrackergold://auth/callback';
const failed = "Google sign in didn't finish. Please try again.";

test('a redirect with tokens signs in', () => {
  assert.deepEqual(
    readOAuthRedirect({ type: 'success', url: `${base}#access_token=aaa&refresh_token=rrr&token_type=bearer` }),
    { accessToken: 'aaa', refreshToken: 'rrr' }
  );
  assert.deepEqual(readOAuthRedirect({ type: 'success', url: `${base}#access_token=aaa` }), { accessToken: 'aaa', refreshToken: '' });
});

test('a refused consent reads as cancelled, in the hash or the query', () => {
  assert.deepEqual(readOAuthRedirect({ type: 'success', url: `${base}#error=access_denied&error_description=denied` }), { error: SIGN_IN_CANCELLED });
  assert.deepEqual(readOAuthRedirect({ type: 'success', url: `${base}?error=access_denied` }), { error: SIGN_IN_CANCELLED });
});

test('a redirect with another error, or a refusal from Supabase, is an error and never shows server text', () => {
  assert.deepEqual(readOAuthRedirect({ type: 'success', url: `${base}#error=server_error&error_description=Database+error` }), { error: failed });
  assert.deepEqual(readOAuthRedirect({ type: 'success', url: `${base}#error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed` }), { error: failed });
  assert.deepEqual(readOAuthRedirect({ type: 'success', url: base }), { error: failed });
  assert.deepEqual(readOAuthRedirect({ type: 'success', url: 'not a url' }), { error: failed });
  assert.deepEqual(readOAuthRedirect({ type: 'success' }), { error: failed });
});

test('a cancel or dismiss reads as cancelled, any other result as an error', () => {
  assert.deepEqual(readOAuthRedirect({ type: 'cancel' }), { error: SIGN_IN_CANCELLED });
  assert.deepEqual(readOAuthRedirect({ type: 'dismiss' }), { error: SIGN_IN_CANCELLED });
  assert.deepEqual(readOAuthRedirect({ type: 'locked' }), { error: failed });
  assert.deepEqual(readOAuthRedirect(null), { error: failed });
});
