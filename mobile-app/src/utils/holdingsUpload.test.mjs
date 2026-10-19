// Run with: node --test mobile-app/src/utils/holdingsUpload.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { HOLDINGS_OWNER_KEY, SYNCED_KEY_PREFIX, holdingsToUpload, mayUploadLocalStack, stackOwnerOf } from './holdingsUpload.js';

test('the owner lives under a stack_ key', () => {
  assert.equal(HOLDINGS_OWNER_KEY, 'stack_holdings_owner');
});

test("a guest's stack or one from before accounts goes up to any account", () => {
  assert.equal(mayUploadLocalStack(null, 'b'), true);
  assert.equal(mayUploadLocalStack(undefined, 'b'), true);
  assert.equal(mayUploadLocalStack('', 'b'), true);
});

test("an account's own stack goes up to it", () => {
  assert.equal(mayUploadLocalStack('a', 'a'), true);
});

test("another account's stack never goes up", () => {
  assert.equal(mayUploadLocalStack('a', 'b'), false);
});

test('only holdings this account has never had go up', () => {
  const guest = { id: 1 };
  const fromCloud = { id: 2, supabase_id: 'row-2' };
  const deletedInCloud = { id: 3, supabase_id: 'row-3' };
  const sameLocalId = { id: 4 };
  const items = [guest, fromCloud, deletedInCloud, sameLocalId];
  assert.deepEqual(holdingsToUpload(items, new Set([4]), new Set(['row-2', 'row-3'])), [guest]);
});

test("a backup from another account goes up, since its rows aren't this account's", () => {
  const restored = { id: 5, supabase_id: 'other-account-row' };
  assert.deepEqual(holdingsToUpload([restored], new Set(), new Set(['row-2'])), [restored]);
  assert.deepEqual(holdingsToUpload([restored], new Set()), [restored]);
});

test('nothing to upload from nothing', () => {
  assert.deepEqual(holdingsToUpload(undefined, new Set()), []);
  assert.deepEqual(holdingsToUpload([], new Set([1])), []);
});

test('a recorded owner wins', () => {
  assert.equal(stackOwnerOf('a', ['stack_synced_b'], 'b'), 'a');
});

test("an older build's synced key names the owner of a stack with none recorded", () => {
  // The first update onto 3.0.7: account a's session expired and b signs in
  assert.equal(SYNCED_KEY_PREFIX, 'stack_synced_');
  const keys = ['stack_silver', 'stack_synced_a', 'stack_gold'];
  assert.equal(stackOwnerOf(null, keys, 'b'), 'a');
  assert.equal(mayUploadLocalStack(stackOwnerOf(null, keys, 'b'), 'b'), false);
});

test("this account's own synced key wins over another's", () => {
  assert.equal(stackOwnerOf(null, ['stack_synced_a', 'stack_synced_b'], 'b'), 'b');
});

test('no owner and no synced key is a guest stack', () => {
  assert.equal(stackOwnerOf(null, ['stack_silver', 'stack_guest_mode'], 'b'), null);
  assert.equal(stackOwnerOf(undefined, undefined, 'b'), null);
});
