import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldSnapshot, snapshotDateKey, snapshotDateKeys, LEGACY_SNAPSHOT_DATE_KEY, createSnapshotSaveLatch } from './snapshotGate.js';
import { readFileSync } from 'node:fs';

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

test('one snapshot save per account at a time', () => {
  const latch = createSnapshotSaveLatch();
  assert.equal(latch.claim('a'), true);
  assert.equal(latch.claim('a'), false, 'a second save for a waits out the first');
  assert.equal(latch.claim('b'), true, 'another account is never blocked');
  latch.release('a');
  assert.equal(latch.claim('a'), true, 'a can save again once its save ends');
  assert.equal(latch.claim(null), false);
  assert.equal(latch.claim(undefined), false);
});

test('saveDailySnapshot claims the latch, releases it in finally and checks the account after the token', () => {
  const app = readFileSync(new URL('../../App.js', import.meta.url), 'utf8');
  const start = app.indexOf('const saveDailySnapshot = async () => {');
  const end = app.indexOf('const calculateHistoricalPortfolioData', start);
  const save = app.slice(start, end);
  assert.ok(start > 0 && end > start);
  assert.match(save, /const accountGen = accountGenRef\.current;\s*const saveKey = `\$\{userId\}#\$\{accountGen\}`;/);
  assert.match(save, /if \(!snapshotSaveLatch\.claim\(saveKey\)\) return;\s*try \{/);
  assert.match(save, /\} finally \{\s*snapshotSaveLatch\.release\(saveKey\);\s*\}\s*\};/);
  assert.match(save, /const headers = await withSession\(\{ 'Content-Type': 'application\/json' \}\);\s*if \(lastAccountIdRef\.current !== userId \|\| accountGenRef\.current !== accountGen\) return;\s*const response = await fetch\(`\$\{API_BASE_URL\}\/v1\/snapshots`, \{\s*method: 'POST',\s*headers,/);
});
