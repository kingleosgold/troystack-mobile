// Run with: node --test mobile-app/src/utils/syncRetry.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { SYNC_RETRY_DELAYS_MS, syncRetryDelay, syncRetryDue } from './syncRetry.js';

test('spaces the tries out and stops after the last one', () => {
  assert.deepEqual(SYNC_RETRY_DELAYS_MS.map((_, i) => syncRetryDelay(i)), SYNC_RETRY_DELAYS_MS);
  for (let i = 1; i < SYNC_RETRY_DELAYS_MS.length; i++) {
    assert.ok(SYNC_RETRY_DELAYS_MS[i] > SYNC_RETRY_DELAYS_MS[i - 1]);
  }
  assert.equal(syncRetryDelay(SYNC_RETRY_DELAYS_MS.length), null);
  assert.equal(syncRetryDelay(99), null);
});

test('a bad count never schedules a try', () => {
  assert.equal(syncRetryDelay(-1), null);
  assert.equal(syncRetryDelay(1.5), null);
  assert.equal(syncRetryDelay(undefined), null);
  assert.equal(syncRetryDelay(NaN), null);
});

const due = { signedIn: true, syncError: 'Network request failed', hasSyncedOnce: false, appActive: true };

test('a failed first sync on screen is due a try', () => {
  assert.equal(syncRetryDue(due), true);
});

test('nothing is due without a failure, after a good sync, signed out or in the background', () => {
  assert.equal(syncRetryDue({ ...due, syncError: null }), false);
  assert.equal(syncRetryDue({ ...due, hasSyncedOnce: true }), false);
  assert.equal(syncRetryDue({ ...due, signedIn: false }), false);
  assert.equal(syncRetryDue({ ...due, appActive: false }), false);
});
