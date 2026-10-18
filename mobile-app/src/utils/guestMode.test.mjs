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
