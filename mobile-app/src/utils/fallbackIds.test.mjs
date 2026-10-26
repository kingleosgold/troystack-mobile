// Run with: node --test mobile-app/src/utils/fallbackIds.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { idsForFetch } from './fallbackIds.js';

test('rows with a local_id keep it', () => {
  assert.deepEqual(idsForFetch([11, 22, 33], 1000), [11, 22, 33]);
});

test('rows with no local_id each get an id of their own', () => {
  const ids = idsForFetch([undefined, null, 0, undefined], 1000);
  assert.deepEqual(ids, [1000, 1001, 1002, 1003]);
  assert.equal(new Set(ids).size, ids.length);
});

test('a generated id skips any local_id in the same fetch', () => {
  assert.deepEqual(idsForFetch([1001, undefined, 1000, undefined], 1000), [1001, 1002, 1000, 1003]);
});

test('an empty or missing fetch gives no ids', () => {
  assert.deepEqual(idsForFetch([], 1000), []);
  assert.deepEqual(idsForFetch(undefined, 1000), []);
});

test('a local_id repeated in one fetch stays on its first row only', () => {
  const ids = idsForFetch([5, 5, undefined, 5], 1000);
  assert.deepEqual(ids, [5, 1000, 1001, 1002]);
  assert.equal(new Set(ids).size, ids.length);
});
