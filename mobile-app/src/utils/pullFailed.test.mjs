import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pullFailedAlert, pullFailedDue } from './pullFailed.js';

const app = readFileSync(new URL('../../App.js', import.meta.url), 'utf8');

test('a failed pull shows the notice only while the same account is signed in', () => {
  assert.equal(pullFailedDue({ signedIn: true, failed: true, sameAccount: true }), true);
  assert.equal(pullFailedDue({ signedIn: true, failed: false, sameAccount: true }), false);
  assert.equal(pullFailedDue({ signedIn: true, failed: true, sameAccount: false }), false);
  assert.equal(pullFailedDue({ signedIn: false, failed: true, sameAccount: true }), false);
});

test("the notice says the phone's stack is unchanged and has no em dash", () => {
  const { title, message } = pullFailedAlert();
  assert.ok(title.length > 0);
  assert.match(message, /unchanged/);
  assert.match(message, /Pull down to try again/);
  assert.ok(!/—/.test(title + message));
});

test("each of the sync's failures marks its own outcome, kept by its number when it ends", () => {
  const start = app.indexOf('const syncHoldingsWithSupabase = async');
  const body = app.slice(start, app.indexOf('// A change away from a signed-in account stops', start));
  const sets = [...body.matchAll(/setSyncError\((?!null)[^;]*\);/g)];
  assert.equal(sets.length, 3);
  for (const set of sets) {
    assert.ok(body.slice(Math.max(0, set.index - 40), set.index).includes('failed = true;'), set[0]);
  }
  const numbered = body.indexOf('const seq = ++syncSeqRef.current;');
  assert.ok(numbered > body.indexOf('isSyncingRef.current = true;') && numbered < body.indexOf('holdingWrites.settled('));
  assert.match(body, /\} finally \{\n\s*syncOutcomeRef\.current = \{ seq, failed \};\n\s*ended\(\);\n\s*isSyncingRef\.current = false;/);
});

test('the My Stack pull waits for a sync already running and judges only its own', () => {
  const fn = app.slice(app.indexOf('const onRefreshDashboard = async () => {'), app.indexOf('const onRefreshAnalytics = async () => {'));
  const first = fn.indexOf('const firstSeq = syncSeqRef.current + (isSyncingRef.current ? 0 : 1);');
  assert.ok(first > 0 && first < fn.indexOf('syncHoldingsWithSupabase(true)'));
  const wait = fn.indexOf('await syncEndRef.current;');
  assert.ok(wait > fn.indexOf('await Promise.all(promises);') && wait < fn.indexOf('setIsRefreshing(false);'));
  assert.ok(fn.includes('failed: outcome.seq === firstSeq && outcome.failed'));
  assert.ok(fn.includes('sameAccount: accountGenRef.current === accountGenAtPull'));
  assert.equal([...app.matchAll(/pullFailedAlert\(\)/g)].length, 1);
});
