// Run with: node --test mobile-app/src/utils/signOutUnsent.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { unsentCount, unsentSignOutAlert } from './signOutUnsent.js';

const lists = (silver = [], gold = [], platinum = [], palladium = []) => [silver, gold, platinum, palladium];

test('a synced stack has nothing unsent', () => {
  assert.equal(unsentCount(lists([{ id: 'a', supabase_id: 'r1' }], [{ id: 'b', supabase_id: 'r2' }]), 'u1'), 0);
});

test('an add marked for this account counts', () => {
  assert.equal(unsentCount(lists([{ id: 'a', restoredFor: 'u1' }]), 'u1'), 1);
});

test('an add marked for another account does not', () => {
  assert.equal(unsentCount(lists([{ id: 'a', restoredFor: 'u2' }]), 'u1'), 0);
});

test('a holding added as a guest counts, since the next sync sends it', () => {
  assert.equal(unsentCount(lists([], [{ id: 'a', addedAsGuest: true }]), 'u1'), 1);
});

test('an edit marked for its row counts, across metals', () => {
  const edit = { id: 'a', supabase_id: 'r1', editPendingFor: 'u1' };
  const other = { id: 'b', supabase_id: 'r2', editPendingFor: 'u2' };
  assert.equal(unsentCount(lists([edit], [], [other], [{ ...edit, id: 'c', supabase_id: 'r3' }]), 'u1'), 2);
});

test('a claimed stack whose first sync failed counts whole, rows aside', () => {
  const stack = lists([{ id: 'a' }, { id: 'b', supabase_id: 'r1' }], [{ id: 'c' }]);
  assert.equal(unsentCount(stack, 'u1', { owner: 'u1', firstSync: true }), 2);
  assert.equal(unsentCount(stack, 'u1', { owner: 'u1', firstSync: false }), 0);
});

test("another account's stack on a first sync counts only what goes up", () => {
  const stack = lists([{ id: 'a' }, { id: 'b', addedAsGuest: true }]);
  assert.equal(unsentCount(stack, 'u1', { owner: 'u2', firstSync: true }), 1);
});

test('a marked holding on a row counts, since the row may be another account\'s', () => {
  assert.equal(unsentCount(lists([{ id: 'a', supabase_id: 'r1', restoredFor: 'u1' }]), 'u1'), 1);
  assert.equal(unsentCount(lists([{ id: 'a', supabase_id: 'old', addedAsGuest: true }]), 'u1', { owner: 'u1', firstSync: true }), 1);
});

test('writes still on their way count', () => {
  assert.equal(unsentCount(lists(), 'u1', { inFlight: 2 }), 2);
});

test('no account or no lists counts nothing', () => {
  assert.equal(unsentCount(lists([{ id: 'a', restoredFor: 'u1' }]), null), 0);
  assert.equal(unsentCount(null, 'u1'), 0);
});

test('the ask names how many and what signing out does', () => {
  assert.equal(unsentSignOutAlert(1).message, "1 change on this phone hasn't reached your account. Signing out now clears it from this phone. Send it first, or sign out anyway.");
  assert.ok(unsentSignOutAlert(3).message.startsWith("3 changes on this phone haven't reached your account."));
  assert.ok(unsentSignOutAlert(3).message.includes('clears them'));
});

test('the ask has no em dash', () => {
  assert.ok(!/—/.test(unsentSignOutAlert(1).message + unsentSignOutAlert(2).message + unsentSignOutAlert(1).title));
});

import { readFileSync } from 'node:fs';
const app = readFileSync(new URL('../../App.js', import.meta.url), 'utf8');
const screen = readFileSync(new URL('../screens/AccountScreen.tsx', import.meta.url), 'utf8');

test('both Sign Out buttons ask first, and a deleted account still signs out at once', () => {
  assert.match(app, /\/\/ hasn't reached their account yet\s*confirmSignOut\(\);/);
  assert.match(app, /onSignOut=\{\(\) => \{ deletedAccountRef\.current = supabaseUser\?\.id \|\| null; return performSignOut\(\); \}\}\s*onSignOutTap=\{\(\) => confirmSignOut\(\)\}/);
  assert.match(screen, /if \(onSignOutTap\) onSignOutTap\(\);\s*else onSignOut\(\);/);
});

test('the count reads the marks still in the refs, as a sync does', () => {
  const start = app.indexOf('const countUnsent = async (userId) => {');
  const body = app.slice(start, app.indexOf('const performSignOut = async () => {'));
  assert.ok(start > 0);
  assert.match(body, /withRetryMarks\(items, retryMarksRef\.current, userId\)/);
  assert.match(body, /withEditMarks\(items, editMarksRef\.current, userId\)/);
  assert.match(body, /if \(!count\) \{\s*performSignOut\(\);\s*return;\s*\}/);
  assert.match(body, /firstSync = !hasEverSynced;/);
  assert.match(body, /inFlight: holdingWrites\.countFor\(userId\)/);
});

test('a deleted account skips the ask, and Send Now never ends in silence', () => {
  const start = app.indexOf('const confirmSignOut = async () => {');
  const body = app.slice(start, app.indexOf('const performSignOut = async () => {'));
  assert.match(body, /if \(userId && deletedAccountRef\.current === userId\) \{\s*performSignOut\(\);\s*return;\s*\}/);
  assert.match(body, /pull === 'failed'\) return;/);
  assert.match(body, /if \(left\) \{\s*confirmSignOut\(\);\s*return;\s*\}/);
  assert.match(body, /if \(signOutAskRef\.current\) return;/);
  assert.match(app, /return 'failed';/);
});

test('the stack and the writes on their way are read together after the storage wait', () => {
  const start = app.indexOf('const countUnsent = async (userId) => {');
  const body = app.slice(start, app.indexOf('// Send Now runs My Stack'));
  const wait = body.indexOf('await Promise.all');
  assert.ok(wait > 0);
  assert.ok(body.indexOf('committedStackRef.current') > wait);
  assert.ok(body.indexOf('holdingWrites.countFor(userId)') > wait);
});
