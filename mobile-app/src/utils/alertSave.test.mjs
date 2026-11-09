// Run with: node --test mobile-app/src/utils/alertSave.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { alertSaved, ALERT_NOT_SAVED } from './alertSave.js';

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
  assert.ok(fn.indexOf('ALERT_NOT_SAVED') > gate);
  assert.ok(fn.indexOf('savePriceAlerts(') > gate, 'nothing saves locally before the gate');
  assert.ok(fn.indexOf("'Alert Created'") > gate);
});
