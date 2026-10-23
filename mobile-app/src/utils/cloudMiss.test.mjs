// Run with: node --test mobile-app/src/utils/cloudMiss.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CLOUD_MISS_GAP_MS, cloudMissAlert, cloudMissDue } from './cloudMiss.js';

test('the first miss shows a notice', () => {
  assert.equal(cloudMissDue(null, 1000), true);
  assert.equal(cloudMissDue(undefined, 1000), true);
});

test('a miss soon after the last notice shows none', () => {
  assert.equal(cloudMissDue(1000, 1000 + CLOUD_MISS_GAP_MS - 1), false);
});

test('a miss after the gap shows another', () => {
  assert.equal(cloudMissDue(1000, 1000 + CLOUD_MISS_GAP_MS), true);
});

test('an add and an edit name what missed', () => {
  assert.equal(cloudMissAlert('add').title, 'Saved on this phone only');
  assert.ok(cloudMissAlert('add').message.startsWith("This holding didn't reach your account yet."));
  assert.ok(cloudMissAlert('edit').message.startsWith("Your change didn't reach your account yet."));
});

test('the notice says how to send it', () => {
  // My Stack's pull to refresh runs the holdings sync, the Dashboard's doesn't
  assert.ok(cloudMissAlert('add').message.includes('Pull down on My Stack'));
  assert.ok(!cloudMissAlert('add').message.includes('Dashboard'));
});

test('the notice warns that signing out clears it', () => {
  assert.ok(cloudMissAlert('edit').message.includes('signing out clears it'));
});

test('the words carry no em dash', () => {
  for (const kind of ['add', 'edit']) {
    const { title, message } = cloudMissAlert(kind);
    assert.ok(!`${title}${message}`.includes('—'));
  }
});
