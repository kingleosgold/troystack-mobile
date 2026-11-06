// Run with: node --test mobile-app/src/utils/widgetLaunchLock.test.mjs
// RevenueCat setup used to run on the biometric gate alone. When the saved
// Supabase session took longer than setup's half second, setup read the
// anonymous customer as free and the widget lock fired on a Gold member.
// These read the source, since App.js isn't under test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../../App.js', import.meta.url), 'utf8');

const setupStart = app.indexOf('// Initialize RevenueCat (non-blocking, runs after authentication)');
const setupEnd = app.indexOf('// RevenueCat real-time listener');
const setup = app.slice(setupStart, setupEnd);

test('RevenueCat setup waits for the saved session', () => {
  assert.ok(setupStart >= 0 && setupEnd > setupStart, 'setup effect not found');
  const gate = setup.indexOf('if (!sessionRestored) return;');
  const timer = setup.indexOf('setTimeout(');
  assert.ok(gate >= 0, 'setup has no session gate');
  assert.ok(gate < timer, 'the gate comes before setup is scheduled');
  assert.match(setup, /\}, \[isAuthenticated, sessionRestored, supabaseUser\?\.id, guestMode\]\);/);
});

test('the session flag latches once loading first ends', () => {
  assert.match(app, /const \[sessionRestored, setSessionRestored\] = useState\(false\);/);
  assert.match(app, /useEffect\(\(\) => \{\n\s+if \(!authLoading\) setSessionRestored\(true\);\n\s+\}, \[authLoading\]\);/);
  // Never set back, so a sign out's loading doesn't rerun setup for the same account.
  assert.doesNotMatch(app, /setSessionRestored\(false\)/);
});

test('subscriptionLoading starts true so the lock waits for setup', () => {
  assert.match(app, /const \[subscriptionLoading, setSubscriptionLoading\] = useState\(true\);/);
});
