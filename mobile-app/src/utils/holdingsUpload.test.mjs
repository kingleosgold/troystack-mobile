// Run with: node --test mobile-app/src/utils/holdingsUpload.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { HOLDINGS_OWNER_KEY, holdingsToUpload, mayUploadLocalStack } from './holdingsUpload.js';

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

test('only holdings the cloud has never had go up', () => {
  const guest = { id: 1 };
  const fromCloud = { id: 2, supabase_id: 'row-2' };
  const deletedInCloud = { id: 3, supabase_id: 'row-3' };
  const sameLocalId = { id: 4 };
  const items = [guest, fromCloud, deletedInCloud, sameLocalId];
  assert.deepEqual(holdingsToUpload(items, new Set([4])), [guest]);
});

test('nothing to upload from nothing', () => {
  assert.deepEqual(holdingsToUpload(undefined, new Set()), []);
  assert.deepEqual(holdingsToUpload([], new Set([1])), []);
});
