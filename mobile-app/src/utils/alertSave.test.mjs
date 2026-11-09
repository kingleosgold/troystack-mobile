// Run with: node --test mobile-app/src/utils/alertSave.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { alertSaved, alertNotSavedCopy, ALERT_NOT_SAVED, ALERT_REJECTED } from './alertSave.js';

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
  const noted = fn.indexOf('const accountGen = accountGenRef.current');
  const post = fn.indexOf("fetch(`${API_BASE_URL}/v1/push/price-alerts`");
  const check = fn.indexOf('if (accountGenRef.current !== accountGen) return;');
  assert.ok(noted > 0 && noted < post, 'notes the account before the POST');
  assert.ok(check > post, 'checks it after the POST');
  assert.ok(check < fn.indexOf('if (!saved)'), 'before the not saved alert');
  assert.ok(check < fn.indexOf('savePriceAlerts('), 'before any local write');
  assert.ok(check < fn.indexOf("'Alert Created'"));
});
