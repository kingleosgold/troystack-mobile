import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pullFailedAlert, pullFailedDue } from './pullFailed.js';

const app = readFileSync(new URL('../../App.js', import.meta.url), 'utf8');

test('a failed pull shows the notice only for the account still signed in', () => {
  assert.equal(pullFailedDue({ failed: true, userIdAtPull: 'a', userIdNow: 'a' }), true);
  assert.equal(pullFailedDue({ failed: false, userIdAtPull: 'a', userIdNow: 'a' }), false);
  assert.equal(pullFailedDue({ failed: true, userIdAtPull: 'a', userIdNow: 'b' }), false);
  assert.equal(pullFailedDue({ failed: true, userIdAtPull: 'a', userIdNow: null }), false);
  assert.equal(pullFailedDue({ failed: true, userIdAtPull: null, userIdNow: null }), false);
});

test("the notice says the phone's stack is unchanged and has no em dash", () => {
  const { title, message } = pullFailedAlert();
  assert.ok(title.length > 0);
  assert.match(message, /unchanged/);
  assert.ok(!/—/.test(title + message));
});

test("each of the sync's failures marks it failed, and a new sync starts unmarked", () => {
  const start = app.indexOf('const syncHoldingsWithSupabase = async');
  const body = app.slice(start, app.indexOf('// A change away from a signed-in account stops', start));
  const sets = [...body.matchAll(/setSyncError\((?!null)[^;]*\);/g)];
  assert.equal(sets.length, 3);
  for (const set of sets) {
    const lead = body.slice(Math.max(0, set.index - 160), set.index);
    assert.ok(lead.includes('syncFailedRef.current = true;'), set[0]);
  }
  assert.ok(body.indexOf('syncFailedRef.current = false;') < body.indexOf('holdingWrites.settled('));
});

test('only the My Stack pull shows the notice', () => {
  const fn = app.slice(app.indexOf('const onRefreshDashboard = async () => {'), app.indexOf('const onRefreshAnalytics = async () => {'));
  assert.ok(fn.includes('syncFailedRef.current = false;'));
  assert.ok(fn.indexOf('syncFailedRef.current = false;') < fn.indexOf('syncHoldingsWithSupabase(true)'));
  assert.ok(fn.indexOf('await Promise.all(promises);') < fn.indexOf('pullFailedDue('));
  assert.ok(fn.includes('Alert.alert(title, message);'));
  assert.equal([...app.matchAll(/pullFailedAlert\(\)/g)].length, 1);
});
