// Run with: node --test mobile-app/src/utils/alertSave.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { alertSaved, alertNotSavedCopy, mergeSyncedAlerts, ALERT_NOT_SAVED, ALERT_REJECTED } from './alertSave.js';

const appJs = readFileSync(new URL('../../App.js', import.meta.url), 'utf8');

test('a 2xx with success true is saved', () => {
  assert.equal(alertSaved({ ok: true, status: 200 }, { success: true }), true);
  assert.equal(alertSaved({ ok: true, status: 201 }, { success: true, alert: {} }), true);
});

test('a thrown request is not saved', () => {
  assert.equal(alertSaved(null, null), false);
});

test('a non-2xx is not saved, even with success true in the body', () => {
  assert.equal(alertSaved({ ok: false, status: 500 }, { success: true }), false);
  assert.equal(alertSaved({ ok: false, status: 401 }, { error: 'Unauthorized' }), false);
});

test('a 2xx without success true is not saved', () => {
  assert.equal(alertSaved({ ok: true, status: 200 }, null), false);
  assert.equal(alertSaved({ ok: true, status: 200 }, { success: false, error: 'x' }), false);
  assert.equal(alertSaved({ ok: true, status: 200 }, {}), false);
});

test('the not saved words carry no em dash and no promise', () => {
  assert.doesNotMatch(ALERT_NOT_SAVED.title + ALERT_NOT_SAVED.message, /—|notif/i);
});

test('createPriceAlert only says Alert Created after the server saved it', () => {
  const start = appJs.indexOf('const createPriceAlert = async');
  const end = appJs.indexOf('const togglePriceAlert = async');
  assert.ok(start > 0 && end > start);
  const fn = appJs.slice(start, end);
  const gate = fn.indexOf('if (!saved)');
  assert.ok(gate > 0, 'createPriceAlert checks alertSaved');
  assert.ok(fn.indexOf('alertSaved(') < gate);
  assert.ok(fn.indexOf('alertNotSavedCopy(') > gate);
  assert.ok(fn.indexOf('savePriceAlerts(') > gate, 'nothing saves locally before the gate');
  assert.ok(fn.indexOf("'Alert Created'") > gate);
});

test('a 400 or 422 says the server turned it down, anything else blames the connection', () => {
  assert.equal(alertNotSavedCopy({ ok: false, status: 400 }), ALERT_REJECTED);
  assert.equal(alertNotSavedCopy({ ok: false, status: 422 }), ALERT_REJECTED);
  assert.equal(alertNotSavedCopy({ ok: false, status: 500 }), ALERT_NOT_SAVED);
  assert.equal(alertNotSavedCopy({ ok: false, status: 401 }), ALERT_NOT_SAVED);
  assert.equal(alertNotSavedCopy({ ok: true, status: 200 }), ALERT_NOT_SAVED);
  assert.equal(alertNotSavedCopy(null), ALERT_NOT_SAVED);
});

test('the rejected words carry no em dash and no promise', () => {
  assert.doesNotMatch(ALERT_REJECTED.title + ALERT_REJECTED.message, /\u2014|notif/i);
});

test('createPriceAlert adds to the latest list, not the one from before the await', () => {
  const start = appJs.indexOf('const createPriceAlert = async');
  const end = appJs.indexOf('const togglePriceAlert = async');
  const fn = appJs.slice(start, end);
  assert.ok(fn.includes('priceAlertsRef.current'), 'reads the ref');
  assert.doesNotMatch(fn, /\.\.\.priceAlerts\]/, 'no spread of the closed-over list');
});

test('Create Alert shows it is busy while the save is out', () => {
  assert.match(appJs, /onPress=\{createPriceAlert\}\s*disabled=\{creatingAlert\}/);
});

test('a save that lands after a sign out, switch or wipe writes nothing to the phone', () => {
  const start = appJs.indexOf('const createPriceAlert = async');
  const end = appJs.indexOf('const togglePriceAlert = async');
  const fn = appJs.slice(start, end);
  const noted = fn.indexOf('const accountGen = accountChangedGenRef.current');
  const post = fn.indexOf("fetch(`${API_BASE_URL}/v1/push/price-alerts`");
  const check = fn.indexOf('if (accountChangedGenRef.current !== accountGen) return;');
  assert.ok(noted > 0 && noted < post, 'notes the account before the POST');
  assert.ok(check > post, 'checks it after the POST');
  assert.ok(check < fn.indexOf('if (!saved)'), 'before the not saved alert');
  assert.ok(check < fn.indexOf('savePriceAlerts('), 'before any local write');
  assert.ok(check < fn.indexOf("'Alert Created'"));
});

test('a sign out that failed leaves the alert owner count alone', () => {
  const start = appJs.indexOf('const performSignOut = async');
  const fn = appJs.slice(start, appJs.indexOf('\n  };', start));
  const failed = fn.indexOf('if (signOutError) return false;');
  const bumps = [...fn.matchAll(/accountChangedGenRef\.current \+= 1/g)].map((m) => m.index);
  assert.ok(failed > 0);
  assert.equal(bumps.length, 1);
  assert.ok(bumps[0] > failed, 'moves only after the sign out took');
});

test('a sync keeps an alert created while its re-POSTs were out', () => {
  const backendAlerts = [{ id: 'b1' }];
  const syncedLocal = [{ id: 'l1' }];
  const seenIds = new Set(['b1', 'l1', 'orphan']);
  const current = [{ id: 'new' }, { id: 'b1' }, { id: 'orphan' }];
  const final = mergeSyncedAlerts({ backendAlerts, syncedLocal, seenIds, current });
  assert.deepEqual(final.map(a => a.id), ['new', 'b1', 'l1']);
});

test('a sync drops an orphan the server refused even if it is still on the screen', () => {
  const final = mergeSyncedAlerts({ backendAlerts: [], syncedLocal: [], seenIds: new Set(['x']), current: [{ id: 'x' }] });
  assert.deepEqual(final, []);
});

test('a sync with nothing on the screen writes the server and synced lists', () => {
  const final = mergeSyncedAlerts({ backendAlerts: [{ id: 'b' }], syncedLocal: [{ id: 'l' }], seenIds: new Set(['b', 'l']), current: undefined });
  assert.deepEqual(final.map(a => a.id), ['b', 'l']);
});

test('syncAlertsFromBackend merges into the latest list and writes nothing after an account change', () => {
  const start = appJs.indexOf('const syncAlertsFromBackend = async');
  const end = appJs.indexOf('const createPriceAlert = async');
  assert.ok(start > 0 && end > start);
  const fn = appJs.slice(start, end);
  const loop = fn.indexOf('for (const alert of localOnly)');
  const merge = fn.indexOf('mergeSyncedAlerts(');
  const gate = fn.indexOf('accountChangedGenRef.current !== accountGen');
  assert.ok(fn.indexOf('const accountGen = accountChangedGenRef.current') >= 0);
  assert.ok(loop > 0 && gate > loop && merge > gate, 'the gate and the merge come after the re-POSTs');
  assert.ok(fn.indexOf('priceAlertsRef.current', merge) > merge);
  assert.ok(fn.indexOf('setPriceAlerts(final)') > merge);
});
