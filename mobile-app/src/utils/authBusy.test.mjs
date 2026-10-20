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
