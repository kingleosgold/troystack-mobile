// Run with: node --test mobile-app/src/utils/clearData.test.mjs
// Clear All Data left dataLoaded false until relaunch, so nothing saved and
// a sign in after the wipe stuck on the loading screen. A signed-in wipe
// also let the next sync pull the cloud stack straight back. The App.js
// checks read the source, since App.js isn't under test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clearDataPrompt, clearDataDone } from './clearData.js';

const app = readFileSync(new URL('../../App.js', import.meta.url), 'utf8');

function slice(start, end) {
  const a = app.indexOf(start);
  const b = app.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `${start} not found`);
  return app.slice(a, b);
}

test('a reset never sets dataLoaded back to false', () => {
  const reset = slice('const resetAllState = (fullReset = true) => {', 'const clearAllData = async () => {');
  assert.doesNotMatch(reset, /setDataLoaded\(false\)/);
  assert.doesNotMatch(app, /setDataLoaded\(false\)/);
});

test('a signed-in wipe signs out before it clears the phone', () => {
  const clear = slice('const clearAllData = async () => {', 'const performSignOut = async () => {');
  const signOut = clear.indexOf('if (signedIn) await performSignOut();');
  assert.ok(signOut >= 0);
  assert.ok(signOut < clear.indexOf('await AsyncStorage.clear();'));
  assert.match(clear, /clearDataDone\(signedIn\)/);
});

test('the words tell a signed-in user the cloud copy stays', () => {
  assert.match(clearDataPrompt(true), /on this phone/);
  assert.match(clearDataPrompt(true), /signs you out/);
  assert.match(clearDataPrompt(true), /cloud copy stays/);
  assert.match(clearDataDone(true), /signed out/);
  assert.equal(clearDataPrompt(false), 'Are you sure? This will permanently delete all your holdings and settings.');
  assert.equal(clearDataDone(false), 'All your data has been erased. The app has been reset to its initial state.');
  assert.match(app, /clearDataPrompt\(!!supabaseUser\),/);
});
