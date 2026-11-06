import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldSnapshot, snapshotDateKey, snapshotDateKeys, LEGACY_SNAPSHOT_DATE_KEY } from './snapshotGate.js';

const ready = { dataLoaded: true, spotPricesLive: true, hasSyncedOnce: true, syncedUserId: 'b', userId: 'b', hasGold: true };

test('posts once this account has synced with live prices and Gold', () => {
  assert.equal(shouldSnapshot(ready), true);
});

test('waits through the render where the last account still reads synced', () => {
  assert.equal(shouldSnapshot({ ...ready, syncedUserId: 'a' }), false);
  assert.equal(shouldSnapshot({ ...ready, syncedUserId: null }), false);
});

test('waits for each of the other conditions', () => {
  for (const key of ['dataLoaded', 'spotPricesLive', 'hasSyncedOnce', 'hasGold']) {
    assert.equal(shouldSnapshot({ ...ready, [key]: false }), false, key);
  }
  assert.equal(shouldSnapshot({ ...ready, userId: null, syncedUserId: null }), false);
  assert.equal(shouldSnapshot({ ...ready, userId: undefined, syncedUserId: undefined }), false);
});

test('each account keeps its own day', () => {
  assert.notEqual(snapshotDateKey('a'), snapshotDateKey('b'));
  assert.equal(snapshotDateKey('a'), 'lastSnapshotDate_a');
});

test('finds every day key, the old per phone one included', () => {
  const keys = ['stack_gold', LEGACY_SNAPSHOT_DATE_KEY, 'lastSnapshotDate_a', 'lastSnapshotDate_b', null, 'stack_synced_a'];
  assert.deepEqual(snapshotDateKeys(keys), [LEGACY_SNAPSHOT_DATE_KEY, 'lastSnapshotDate_a', 'lastSnapshotDate_b']);
  assert.deepEqual(snapshotDateKeys(undefined), []);
});
