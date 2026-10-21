// Run with: node --test mobile-app/src/utils/guestMode.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { GUEST_MODE_KEY, GUEST_SAVE_NOTE, SEEN_FIRST_LAUNCH_KEY, canSaveHoldings, guestModeAtLaunch, isFirstLaunch } from './guestMode.js';

test('the guest flag lives under the key sign out already clears', () => {
  assert.equal(GUEST_MODE_KEY, 'stack_guest_mode');
});

test('a guest stays a guest across launches', () => {
  assert.equal(guestModeAtLaunch('true', false), true);
});

test('past the first launch, no flag or anything but true opens at sign in', () => {
  assert.equal(guestModeAtLaunch(null, false), false);
  assert.equal(guestModeAtLaunch(undefined, false), false);
  assert.equal(guestModeAtLaunch('false', false), false);
  assert.equal(guestModeAtLaunch('1', false), false);
});

test('a signed-in session wins over a stale guest flag', () => {
  assert.equal(guestModeAtLaunch('true', true), false);
});

test('holdings save once loaded, guest or not', () => {
  assert.equal(canSaveHoldings({ isAuthenticated: true, dataLoaded: true }), true);
});

test('holdings never save before the stored ones load', () => {
  assert.equal(canSaveHoldings({ isAuthenticated: true, dataLoaded: false }), false);
  assert.equal(canSaveHoldings({ isAuthenticated: false, dataLoaded: true }), false);
});

test("the guest note doesn't say the stack is lost on close", () => {
  assert.doesNotMatch(GUEST_SAVE_NOTE, /won't be saved/);
  assert.match(GUEST_SAVE_NOTE, /this phone/);
});

test('the first-launch mark is the key the tutorial already wrote', () => {
  assert.equal(SEEN_FIRST_LAUNCH_KEY, 'stack_has_seen_tutorial');
});

test('a fresh install is a first launch', () => {
  assert.equal(isFirstLaunch(null, null), true);
  assert.equal(isFirstLaunch(undefined, undefined), true);
});

test('a phone that saw the tutorial or was ever a guest is past its first launch', () => {
  assert.equal(isFirstLaunch(null, 'true'), false);
  assert.equal(isFirstLaunch('true', null), false);
  assert.equal(isFirstLaunch('false', null), false);
});

test('a signed-out phone opens at sign in, since sign out keeps the mark', () => {
  assert.equal(guestModeAtLaunch(null, false, isFirstLaunch(null, 'true')), false);
});

test('a first launch opens as a guest', () => {
  assert.equal(guestModeAtLaunch(null, false, true), true);
});

test('a signed-in session wins over a first launch', () => {
  assert.equal(guestModeAtLaunch(null, true, true), false);
});

test("saved holdings mean it isn't a first launch, so an account's stack never opens as a guest's", () => {
  // 3.0.7 cleared the guest flag at sign in and wrote the mark only when the
  // tutorial closed, so an account's stack could have neither
  assert.equal(isFirstLaunch(null, null, true), false);
  assert.equal(isFirstLaunch(null, null, false), true);
  assert.equal(isFirstLaunch(null, null), true);
});

// App.js can't load under node, so this reads its source. Any sign in has to
// clear the flag, not only AuthScreen's, or an email link or password reset
// sign in leaves the phone to open as a guest once the session ends.
test('App.js clears the guest flag on any sign in once the stored data has loaded', async () => {
  const { readFileSync } = await import('node:fs');
  const appSource = readFileSync(new URL('../../App.js', import.meta.url), 'utf8');
  const effect = appSource.match(/useEffect\(\(\) => \{\n\s*if \(!supabaseUser\?\.id \|\| !dataLoaded\) return;[\s\S]*?\}, \[supabaseUser\?\.id, dataLoaded\]\);/);
  assert.ok(effect, 'the sign-in effect is missing');
  assert.match(effect[0], /setGuestMode\(false\)/);
  assert.match(effect[0], /AsyncStorage\.removeItem\(GUEST_MODE_KEY\)/);
});
