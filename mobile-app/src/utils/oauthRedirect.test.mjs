import test from 'node:test';
import assert from 'node:assert/strict';
import { readOAuthRedirect, readLinkRedirect, SIGN_IN_CANCELLED, LINK_CANCELLED, ALREADY_LINKED } from './oauthRedirect.js';

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

test('a link redirect with a session counts as linked', () => {
  assert.deepEqual(readLinkRedirect({ type: 'success', url: `${base}#access_token=aaa&refresh_token=rrr` }), { linked: true });
});

test('a refused consent or a dismiss cancels a link instead of linking it', () => {
  assert.deepEqual(readLinkRedirect({ type: 'success', url: `${base}#error=access_denied&error_description=denied` }), { error: LINK_CANCELLED });
  assert.deepEqual(readLinkRedirect({ type: 'cancel' }), { error: LINK_CANCELLED });
  assert.deepEqual(readLinkRedirect({ type: 'dismiss' }), { error: LINK_CANCELLED });
});

test('a Google account linked elsewhere says so', () => {
  assert.deepEqual(
    readLinkRedirect({ type: 'success', url: `${base}#error=server_error&error_code=identity_already_exists&error_description=Identity+is+already+linked` }),
    { error: ALREADY_LINKED },
  );
  assert.deepEqual(readLinkRedirect({ type: 'success', url: `${base}?error=server_error&error_code=identity_already_exists` }), { error: ALREADY_LINKED });
});

test('any other link redirect without a session is not linked', () => {
  const failed = "Google linking didn't finish. Please try again.";
  assert.deepEqual(readLinkRedirect({ type: 'success', url: base }), { error: failed });
  assert.deepEqual(readLinkRedirect({ type: 'success', url: `${base}#error=server_error` }), { error: failed });
  assert.deepEqual(readLinkRedirect({ type: 'locked' }), { error: failed });
  assert.deepEqual(readLinkRedirect(null), { error: failed });
});
