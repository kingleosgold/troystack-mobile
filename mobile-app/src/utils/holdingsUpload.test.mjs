// Run with: node --test mobile-app/src/utils/holdingsUpload.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { HOLDINGS_OWNER_KEY, HOLDING_METALS, SYNCED_KEY_PREFIX, asAddedBy, asRestoredBy, holdingMetal, holdingsToUpload, mayAddEditedHolding, localHoldingsToSync, mayUploadLocalStack, stackOwnerOf, pendingEdits, syncedKeys, withEditMarks, withPendingEdits, withRetryMarks, withoutGuestMark } from './holdingsUpload.js';

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

test('sign out clears every synced key, so a later guest stack has no owner', () => {
  // a's session ended without a sign out, b synced and then signed out
  const keys = ['stack_synced_a', 'stack_synced_b', 'stack_theme'];
  assert.deepEqual(syncedKeys(keys), ['stack_synced_a', 'stack_synced_b']);
  const left = keys.filter((key) => !syncedKeys(keys).includes(key));
  assert.equal(stackOwnerOf(null, left, 'c'), null);
});

test("a sync clears other accounts' synced keys and keeps its own", () => {
  assert.deepEqual(syncedKeys(['stack_synced_a', 'stack_synced_b', 'stack_gold'], 'b'), ['stack_synced_a']);
  assert.deepEqual(syncedKeys(undefined, 'b'), []);
});

test("of another account's stack only what was added as a guest goes up", () => {
  // a's session expired with its stack on the phone. Someone continues as a
  // guest, adds a holding and signs in as b.
  const fromA = { id: 1 };
  const guestAdded = asAddedBy({ id: 2 }, false);
  const owner = stackOwnerOf(null, ['stack_synced_a'], 'b');
  assert.equal(owner, 'a');
  assert.deepEqual(localHoldingsToSync([fromA, guestAdded], owner, 'b'), [guestAdded]);
});

test('a stack with no owner, or this account\'s own, goes up whole', () => {
  const items = [{ id: 1 }, asAddedBy({ id: 2 }, false)];
  assert.deepEqual(localHoldingsToSync(items, null, 'b'), items);
  assert.deepEqual(localHoldingsToSync(items, 'b', 'b'), items);
  assert.deepEqual(localHoldingsToSync(undefined, 'a', 'b'), []);
});

test('a key 3.0.7 left behind still lets a guest\'s holdings go up', () => {
  const guestAdded = asAddedBy({ id: 3 }, false);
  assert.deepEqual(localHoldingsToSync([guestAdded], stackOwnerOf(null, ['stack_synced_a'], 'c'), 'c'), [guestAdded]);
});

test('only a holding added with no account signed in is marked', () => {
  assert.equal(asAddedBy({ id: 1 }, false).addedAsGuest, true);
  assert.equal('addedAsGuest' in asAddedBy({ id: 1 }, true), false);
});

test("a claimed stack loses its guest marks, so a failed first sync can't hand it on", () => {
  // A guest signs in as a, a's first sync fails, a's session expires, b signs in
  const claimed = withoutGuestMark([asAddedBy({ id: 1 }, false), { id: 2 }]);
  assert.deepEqual(claimed, [{ id: 1 }, { id: 2 }]);
  assert.deepEqual(localHoldingsToSync(claimed, 'a', 'b'), []);
});

test('nothing marked keeps the same array', () => {
  const items = [{ id: 1 }];
  assert.equal(withoutGuestMark(items), items);
  assert.equal(withoutGuestMark(undefined), undefined);
});

test("a guest's additions to an expired session's stack go up when that account signs back in", () => {
  const fromA = { id: 1, supabase_id: 'row-1' };
  const added = asAddedBy({ id: 2 }, false);
  assert.deepEqual(localHoldingsToSync([fromA, added], 'a', 'a', false), [added]);
  assert.deepEqual(localHoldingsToSync([fromA], 'a', 'a', false), []);
});

test("a backup restored with no account signed in goes up to the next account, beside another's stack too", () => {
  // a's session expired. A guest restores a backup, from any account, and signs in as b.
  const restored = asRestoredBy([{ id: 1, supabase_id: 'row-from-a' }, { id: 2 }], null);
  assert.ok(restored.every((item) => item.addedAsGuest === true));
  assert.deepEqual(localHoldingsToSync(restored, 'a', 'b'), restored);
});

test('a backup restored while signed in is that account\'s, so a guest backup loses its marks', () => {
  assert.equal(asRestoredBy(undefined, null), undefined);
  assert.equal(asRestoredBy(undefined, 'a'), undefined);
  // Made as a guest, restored while a is signed in, then a's session expires and b signs in
  const restored = asRestoredBy([asAddedBy({ id: 2 }, false)], 'a');
  assert.deepEqual(restored, [{ id: 2, restoredFor: 'a' }]);
  assert.deepEqual(localHoldingsToSync(restored, 'a', 'b'), []);
  assert.deepEqual(localHoldingsToSync(restored, 'a', 'b', false), []);
});

test('a backup restored while signed in goes up on that account\'s next sync', () => {
  const fromCloud = { id: 1, supabase_id: 'row-1' };
  const restored = asRestoredBy([{ id: 2 }, { id: 3, supabase_id: 'row-3' }], 'a');
  assert.ok(restored.every((item) => item.restoredFor === 'a'));
  assert.deepEqual(localHoldingsToSync([fromCloud, ...restored], 'a', 'a', false), restored);
});

test("a backup restored for one account never goes up to another", () => {
  const restored = asRestoredBy([{ id: 2 }], 'a');
  assert.deepEqual(localHoldingsToSync(restored, 'a', 'b', false), []);
  assert.deepEqual(localHoldingsToSync(restored, 'a', null, false), []);
});

test("a backup restored for one account stays out of another's first sync of an unowned stack", () => {
  // a restores while signed in, a's session ends before a sync claims the stack, b signs in
  const guestAdded = asAddedBy({ id: 1 }, false);
  const restored = asRestoredBy([{ id: 2 }], 'a');
  assert.deepEqual(localHoldingsToSync([guestAdded, ...restored], null, 'b'), [guestAdded]);
  assert.deepEqual(localHoldingsToSync([guestAdded, ...restored], null, 'a'), [guestAdded, ...restored]);
});

test('a backup made after a restore takes the new restorer, or the guest mark with no account', () => {
  const restoredForA = asRestoredBy([{ id: 2 }], 'a');
  assert.deepEqual(asRestoredBy(restoredForA, 'b'), [{ id: 2, restoredFor: 'b' }]);
  assert.deepEqual(asRestoredBy(restoredForA, null), [{ id: 2, addedAsGuest: true }]);
});

test('a scanned holding is filed under its own metal', () => {
  for (const metal of HOLDING_METALS) assert.equal(holdingMetal(metal), metal);
  assert.equal(holdingMetal('Platinum'), 'platinum');
  assert.equal(holdingMetal(' PALLADIUM '), 'palladium');
});

test('a scanned holding with no metal the app tracks goes under silver', () => {
  assert.equal(holdingMetal(undefined), 'silver');
  assert.equal(holdingMetal(null), 'silver');
  assert.equal(holdingMetal(''), 'silver');
  assert.equal(holdingMetal('copper'), 'silver');
  assert.equal(holdingMetal(7), 'silver');
});

test("an edit adds a holding with no row to this account only when it's this account's to take", () => {
  const local = { id: 1 };
  assert.equal(mayAddEditedHolding(local, null, 'b'), true);
  assert.equal(mayAddEditedHolding(local, 'b', 'b'), true);
  assert.equal(mayAddEditedHolding(asAddedBy(local, false), 'a', 'b'), true);
  // a's session expired with a holding it never sent up, and b signed in
  assert.equal(mayAddEditedHolding(local, 'a', 'b'), false);
  assert.equal(mayAddEditedHolding(local, stackOwnerOf(null, ['stack_synced_a'], 'b'), 'b'), false);
});

test("an edit adds a restored holding only to the account that restored it", () => {
  const [forA] = asRestoredBy([{ id: 2 }], 'a');
  assert.equal(mayAddEditedHolding(forA, null, 'b'), false);
  assert.equal(mayAddEditedHolding(forA, 'b', 'b'), false);
  assert.equal(mayAddEditedHolding(forA, 'b', 'a'), true);
  assert.equal(mayAddEditedHolding(forA, null, 'a'), true);
});

test('a holding whose cloud add failed takes the retry mark for its account', () => {
  const items = [{ id: 1 }, { id: 2 }, { id: 3, supabase_id: 'r3' }];
  const marked = withRetryMarks(items, new Map([[2, 'a'], [3, 'a']]), 'a');
  assert.deepEqual(marked, [{ id: 1 }, { id: 2, restoredFor: 'a' }, { id: 3, supabase_id: 'r3' }]);
  // the next sync, no longer a first, sends it up and nothing else
  assert.deepEqual(localHoldingsToSync(marked, 'a', 'a', false), [{ id: 2, restoredFor: 'a' }]);
  // and never to another account
  assert.deepEqual(localHoldingsToSync(marked, 'a', 'b', false), []);
});

test('a retry mark for another account, or none, changes nothing', () => {
  const items = [{ id: 1 }, { id: 2, restoredFor: 'b' }];
  assert.equal(withRetryMarks(items, new Map([[1, 'b'], [2, 'a']]), 'a'), items);
  assert.equal(withRetryMarks(items, new Map(), 'a'), items);
  assert.equal(withRetryMarks(items, new Map([[1, 'a']]), null), items);
  assert.equal(withRetryMarks(undefined, new Map([[1, 'a']]), 'a'), undefined);
});

test('a holding whose cloud update failed takes the edit mark with its row', () => {
  // an edit's copy has no row, so the mark puts it back
  const items = [{ id: 1 }, { id: 2, productName: 'edited' }, { id: 3, supabase_id: 'r3' }];
  const marks = new Map([[2, { rowId: 'r2', userId: 'a' }], [3, { rowId: 'r3', userId: 'a' }]]);
  const marked = withEditMarks(items, marks, 'a');
  assert.deepEqual(marked, [
    { id: 1 },
    { id: 2, productName: 'edited', supabase_id: 'r2', editPendingFor: 'a' },
    { id: 3, supabase_id: 'r3', editPendingFor: 'a' },
  ]);
  // marked again, nothing changes
  assert.equal(withEditMarks(marked, marks, 'a'), marked);
  // and the sync sends both, with their metal
  assert.deepEqual(pendingEdits([[], marked, [], []], 'a'), [
    { item: marked[1], metal: 'gold' },
    { item: marked[2], metal: 'gold' },
  ]);
  assert.deepEqual(pendingEdits([[], marked, [], []], 'b'), []);
  // a marked edit never goes up as a new row on a later sync
  assert.deepEqual(localHoldingsToSync(marked, 'a', 'a', false), []);
});

test('an edit mark for another account, another row or a restored holding changes nothing', () => {
  const items = [{ id: 1 }, { id: 2, supabase_id: 'other' }, { id: 3, restoredFor: 'a' }];
  const marks = new Map([[1, { rowId: 'r1', userId: 'b' }], [2, { rowId: 'r2', userId: 'a' }], [3, { rowId: 'r3', userId: 'a' }]]);
  assert.equal(withEditMarks(items, marks, 'a'), items);
  assert.equal(withEditMarks(items, new Map(), 'a'), items);
  assert.equal(withEditMarks(items, marks, null), items);
  assert.equal(withEditMarks(undefined, marks, 'a'), undefined);
  // a restored holding still to go up isn't an edit to send
  assert.deepEqual(pendingEdits([[{ id: 4, supabase_id: 'r4', editPendingFor: 'a', restoredFor: 'a' }]], 'a'), []);
});

test("an edit the sync couldn't send goes back over its row in the cloud's copy", () => {
  const edited = { id: 2, productName: 'edited', supabase_id: 'r2', editPendingFor: 'a' };
  const cloud = [[{ id: 1, supabase_id: 'r1' }], [{ id: 2, productName: 'old', supabase_id: 'r2' }], [], []];
  const merged = withPendingEdits(cloud, [{ item: edited, metal: 'gold' }]);
  assert.deepEqual(merged, [[{ id: 1, supabase_id: 'r1' }], [edited], [], []]);
  // lists it doesn't touch come back as they were
  assert.equal(merged[0], cloud[0]);
  // a row another device deleted drops the edit
  assert.deepEqual(withPendingEdits([[], [], [], []], [{ item: edited, metal: 'gold' }]), [[], [], [], []]);
  // with nothing unsent the cloud's copy comes back as is
  assert.equal(withPendingEdits(cloud, []), cloud);
});
