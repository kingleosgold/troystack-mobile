// Run with: node --test mobile-app/src/utils/authBusy.test.mjs
// App.js swaps every screen for the loading screen while the auth context's
// loading is true. A sign in that set it unmounted the sign in screen, so a
// wrong password or a refused consent never showed. These read the source,
// since the context and App.js aren't under test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const context = readFileSync(new URL('../contexts/AuthContext.tsx', import.meta.url), 'utf8');
const authScreen = readFileSync(new URL('../screens/AuthScreen.tsx', import.meta.url), 'utf8');

function body(name, next) {
  const start = context.indexOf(`const ${name} = useCallback(`);
  const end = context.indexOf(`const ${next} = useCallback(`);
  assert.ok(start >= 0 && end > start, `${name} not found`);
  return context.slice(start, end);
}

const steps = [
  ['signUp', 'signIn'],
  ['signIn', 'signInWithGoogle'],
  ['signInWithGoogle', 'signInWithApple'],
  ['signInWithApple', 'linkWithGoogle'],
];

for (const [name, next] of steps) {
  test(`${name} marks busy and leaves the app's loading alone`, () => {
    const code = body(name, next);
    assert.match(code, /setBusy\(true\)/);
    assert.match(code, /setBusy\(false\)/);
    assert.doesNotMatch(code, /setLoading\(/);
  });
}

test('the sign in screen waits on busy, not the app wide loading', () => {
  assert.match(authScreen, /busy: loading \} = useAuth\(\)/);
});

test('a second sign in can not start while one runs', () => {
  for (const handler of ['handleEmailAuth', 'handleGoogleAuth', 'handleAppleAuth']) {
    const start = authScreen.indexOf(`const ${handler} = async () => {`);
    assert.ok(start >= 0, `${handler} not found`);
    assert.match(authScreen.slice(start, start + 200), /if \(loading\) return;/, handler);
  }
  // The native Apple button takes no disabled prop
  assert.match(authScreen, /pointerEvents=\{loading \? 'none' : 'auto'\}/);
});

test('the sign in and sign up tabs hold while a sign in runs', () => {
  for (const mode of ['signIn', 'signUp']) {
    const tab = `onPress={() => { setMode('${mode}'); setError(null); }}`;
    const at = authScreen.indexOf(tab);
    assert.ok(at >= 0, `${mode} tab not found`);
    assert.match(authScreen.slice(at, at + tab.length + 60), /disabled=\{loading\}/, mode);
  }
});
