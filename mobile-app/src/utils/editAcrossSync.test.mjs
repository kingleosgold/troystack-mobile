// Run with: node --test mobile-app/src/utils/editAcrossSync.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { editOutlivesSwaps, holdingInStack } from './editAcrossSync.js';

test('an edit with no swap since it opened saves', () => {
  assert.equal(editOutlivesSwaps({ gen: 3, userId: 'a' }, { gen: 3, foreignGen: 3, userId: 'a' }), true);
  assert.equal(editOutlivesSwaps({ gen: 0, userId: null }, { gen: 0, foreignGen: 0, userId: undefined }), true);
});

test('an edit carries across same-stack syncs only', () => {
  // Two sync swaps (a claim and the cloud copy) since it opened
  assert.equal(editOutlivesSwaps({ gen: 3, userId: 'a' }, { gen: 5, foreignGen: 2, userId: 'a' }), true);
  // A restore or reset since it opened
  assert.equal(editOutlivesSwaps({ gen: 3, userId: 'a' }, { gen: 5, foreignGen: 4, userId: 'a' }), false);
  assert.equal(editOutlivesSwaps({ gen: 3, userId: 'a' }, { gen: 4, foreignGen: 4, userId: 'a' }), false);
});

test('an edit never crosses an account change or a missing open', () => {
  assert.equal(editOutlivesSwaps({ gen: 3, userId: 'a' }, { gen: 3, foreignGen: 0, userId: 'b' }), false);
  assert.equal(editOutlivesSwaps({ gen: 3, userId: null }, { gen: 3, foreignGen: 0, userId: 'b' }), false);
  assert.equal(editOutlivesSwaps(null, { gen: 3, foreignGen: 0, userId: 'a' }), false);
});

test('finds the holding by its cloud row, else by local id, in one list', () => {
  const a = { id: 5, supabase_id: 'r1' };
  const b = { id: 5, supabase_id: 'r2' };
  assert.equal(holdingInStack([a, b], { id: 5, supabase_id: 'r2' }), b);
  assert.equal(holdingInStack([a], { id: 5, supabase_id: 'r9' }), null);
  // Before its first sync a holding has no row, and the synced copy has one
  assert.equal(holdingInStack([{ id: 1 }, a], { id: 5 }), a);
  assert.equal(holdingInStack(undefined, { id: 5 }), null);
});
