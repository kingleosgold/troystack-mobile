// Run with: node --test mobile-app/src/utils/signUpResult.test.mjs
// An email sign up that comes back signed in goes straight in, like a sign
// in. Only one with no session says to check the email.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { signUpNextStep } from './signUpResult.js';

test('a session means the account is signed in now', () => {
  assert.equal(signUpNextStep({ error: null, session: { access_token: 't' } }), 'signedIn');
});

test('no session means the confirm link has to be opened first', () => {
  assert.equal(signUpNextStep({ error: null, session: null }), 'checkEmail');
  assert.equal(signUpNextStep({ error: null }), 'checkEmail');
});

test('an error wins over anything else', () => {
  assert.equal(signUpNextStep({ error: { message: 'User already registered' }, session: null }), 'error');
  assert.equal(signUpNextStep({ error: { message: 'x' }, session: { access_token: 't' } }), 'error');
});

test('the auth context hands back the session from signUp', () => {
  const context = readFileSync(new URL('../contexts/AuthContext.tsx', import.meta.url), 'utf8');
  const start = context.indexOf('const signUp = useCallback(');
  const body = context.slice(start, context.indexOf('const signIn = useCallback(', start));
  assert.match(body, /return \{ error: result\.error, session: result\.data\?\.session \?\? null \};/);
});

test('the auth screen only shows the email alert when there is no session', () => {
  const screen = readFileSync(new URL('../screens/AuthScreen.tsx', import.meta.url), 'utf8');
  const start = screen.indexOf("if (mode === 'signUp') {");
  const body = screen.slice(start, screen.indexOf('} else {\n        const { error } = await signIn(', start));
  assert.match(body, /const next = signUpNextStep\(result\);/);
  const signedIn = body.indexOf("next === 'signedIn'");
  const alert = body.indexOf("Alert.alert(");
  assert.ok(signedIn > 0 && alert > signedIn);
  assert.match(body.slice(signedIn, alert), /onAuthSuccess\?\.\(\);/);
});
