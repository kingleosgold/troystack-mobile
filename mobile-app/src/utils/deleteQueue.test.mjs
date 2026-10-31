// Run with: node --test mobile-app/src/utils/deleteQueue.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PENDING_DELETES_KEY,
  parseDeleteQueue,
  withQueuedDelete,
  deletesFor,
  withoutDeletes,
  withoutDeleteOf,
  withoutQueuedDeletes,
  queuedNotSending,
  deleteQueueStore,
  deleteTurns,
} from './deleteQueue.js';

const byRow = { userId: 'u1', rowId: 'row-1', localId: 11, metal: 'silver' };
const byLocal = { userId: 'u1', rowId: null, localId: 22, metal: 'gold' };
const other = { userId: 'u2', rowId: 'row-9', localId: 99, metal: 'silver' };

const memory = (initial = {}) => {
  const data = { ...initial };
  return {
    data,
    async getItem(key) { return key in data ? data[key] : null; },
    async setItem(key, value) { data[key] = value; },
    async removeItem(key) { delete data[key]; },
  };
};

test('nothing stored, or something unreadable, reads as an empty queue', () => {
  assert.deepEqual(parseDeleteQueue(null), []);
  assert.deepEqual(parseDeleteQueue('not json'), []);
  assert.deepEqual(parseDeleteQueue('{"a":1}'), []);
});

test('only well formed deletes are read back', () => {
  const raw = JSON.stringify([byRow, { userId: 'u1', localId: 1, metal: 'copper' }, { localId: 2, metal: 'gold' }, byLocal]);
  assert.deepEqual(parseDeleteQueue(raw), [byRow, byLocal]);
});

test('a delete is queued once', () => {
  const q = withQueuedDelete([], byRow);
  assert.deepEqual(q, [byRow]);
  assert.equal(withQueuedDelete(q, { ...byRow }), q);
});

test('a delete queued with no row takes the row when it is queued again with one', () => {
  const q = withQueuedDelete([], byLocal);
  const withRow = withQueuedDelete(q, { ...byLocal, rowId: 'row-2' });
  assert.deepEqual(withRow, [{ ...byLocal, rowId: 'row-2' }]);
  // and a later one with no row leaves the row alone
  assert.equal(withQueuedDelete(withRow, byLocal), withRow);
});

test('a malformed delete is not queued', () => {
  const q = [byRow];
  assert.equal(withQueuedDelete(q, { userId: '', localId: 1, metal: 'gold' }), q);
  assert.equal(withQueuedDelete(q, null), q);
});

test('each account sees only its own deletes', () => {
  const q = [byRow, other, byLocal];
  assert.deepEqual(deletesFor(q, 'u1'), [byRow, byLocal]);
  assert.deepEqual(deletesFor(q, null), []);
});

test('sent deletes come off the queue and the rest stay', () => {
  const q = [byRow, other, byLocal];
  assert.deepEqual(withoutDeletes(q, [byRow]), [other, byLocal]);
  assert.equal(withoutDeletes(q, []), q);
});

test('a delete that took a row after it was read for sending stays queued', () => {
  const q = [{ ...byLocal, rowId: 'row-2' }];
  assert.deepEqual(withoutDeletes(q, [byLocal]), q);
});

test('a delete that landed comes off by account, local id and metal, whatever row it took', () => {
  const tookRow = { ...byLocal, rowId: 'row-2' };
  const queue = [byRow, tookRow, other];
  assert.deepEqual(withoutDeleteOf(queue, byLocal), [byRow, other]);
  assert.deepEqual(withoutDeleteOf(queue, { ...byRow, rowId: null }), [tookRow, other]);
});

test('taking off a delete that is not queued leaves the queue as it was', () => {
  const queue = [byRow, other];
  assert.equal(withoutDeleteOf(queue, byLocal), queue);
  assert.equal(withoutDeleteOf(queue, { ...byRow, userId: 'u2' }), queue);
  assert.equal(withoutDeleteOf(queue, { ...byRow, metal: 'gold' }), queue);
  assert.equal(withoutDeleteOf(queue, {}), queue);
});

test('the cloud copy drops rows with a delete still queued', () => {
  const silver = [{ id: 11, supabase_id: 'row-1' }, { id: 12, supabase_id: 'row-3' }];
  const gold = [{ id: 22, supabase_id: 'row-2' }, { id: 23, supabase_id: 'row-4' }];
  const platinum = [{ id: 22, supabase_id: 'row-5' }];
  const palladium = [];
  const out = withoutQueuedDeletes([silver, gold, platinum, palladium], [byRow, byLocal, other], 'u1');
  assert.deepEqual(out[0], [{ id: 12, supabase_id: 'row-3' }]);
  assert.deepEqual(out[1], [{ id: 23, supabase_id: 'row-4' }]);
  // the same local id in another metal stays, and untouched lists are the same arrays
  assert.equal(out[2], platinum);
  assert.equal(out[3], palladium);
});

test('another account\'s deletes never touch this account\'s copy', () => {
  const lists = [[{ id: 99, supabase_id: 'row-9' }], [], [], []];
  assert.equal(withoutQueuedDeletes(lists, [other], 'u1'), lists);
});

test('the store writes the queue and removes the key once it empties', async () => {
  const storage = memory();
  const store = deleteQueueStore(storage);
  await store.update((q) => withQueuedDelete(q, byRow));
  assert.deepEqual(JSON.parse(storage.data[PENDING_DELETES_KEY]), [byRow]);
  assert.deepEqual(await store.read(), [byRow]);
  await store.update((q) => withoutDeletes(q, [byRow]));
  assert.equal(PENDING_DELETES_KEY in storage.data, false);
});

test('changes go through in turn, so none is lost between a read and a write', async () => {
  const storage = memory();
  let release;
  const slow = new Promise((resolve) => { release = resolve; });
  const realGet = storage.getItem.bind(storage);
  let first = true;
  storage.getItem = async (key) => {
    if (first) { first = false; await slow; }
    return realGet(key);
  };
  const store = deleteQueueStore(storage);
  const a = store.update((q) => withQueuedDelete(q, byRow));
  const b = store.update((q) => withQueuedDelete(q, byLocal));
  release();
  await Promise.all([a, b]);
  assert.deepEqual(await store.read(), [byRow, byLocal]);
});

test('clear waits for an update already reading, so it never writes the queue back', async () => {
  const storage = memory({ [PENDING_DELETES_KEY]: JSON.stringify([byRow, byLocal]) });
  let release;
  const slow = new Promise((resolve) => { release = resolve; });
  const realGet = storage.getItem.bind(storage);
  storage.getItem = async (key) => { await slow; return realGet(key); };
  const store = deleteQueueStore(storage);
  const update = store.update((q) => withoutDeletes(q, [byRow]));
  const cleared = store.clear();
  release();
  await Promise.all([update, cleared]);
  assert.equal(PENDING_DELETES_KEY in storage.data, false);
});

test('clears counts each clear as it is asked for, before it runs', async () => {
  const storage = memory({ [PENDING_DELETES_KEY]: JSON.stringify([byRow]) });
  const store = deleteQueueStore(storage);
  assert.equal(store.clears(), 0);
  await store.update((q) => withQueuedDelete(q, byLocal));
  assert.equal(store.clears(), 0);
  const cleared = store.clear();
  assert.equal(store.clears(), 1);
  await cleared;
  assert.equal(PENDING_DELETES_KEY in storage.data, false);
});

test('a failed write rejects to its caller and the next change still runs', async () => {
  const storage = memory();
  const store = deleteQueueStore(storage);
  const realSet = storage.setItem.bind(storage);
  storage.setItem = async () => { throw new Error('disk full'); };
  await assert.rejects(store.update((q) => withQueuedDelete(q, byRow)));
  storage.setItem = realSet;
  await store.update((q) => withQueuedDelete(q, byLocal));
  assert.deepEqual(await store.read(), [byLocal]);
});

// The wiring in App.js, read as source like the other sync tests
import { readFileSync } from 'node:fs';
test('a queued delete on its way is counted once, among the writes on their way', () => {
  const queue = [byRow, byLocal, other];
  assert.equal(queuedNotSending(queue, new Set(), 'u1'), 2);
  assert.equal(queuedNotSending(queue, new Set([byRow]), 'u1'), 1);
  // Matched by holding, whatever row the sending one named
  assert.equal(queuedNotSending(queue, new Set([{ ...byLocal, rowId: 'row-2' }]), 'u1'), 1);
  assert.equal(queuedNotSending(queue, new Set([byRow, byLocal]), 'u1'), 0);
  assert.equal(queuedNotSending(queue, null, 'u2'), 1);
  assert.equal(queuedNotSending(queue, new Set([byRow]), null), 0);
});

test('a sending delete the queue read missed takes nothing off another', () => {
  // Queued and sent after the queue was read: the queue holds byRow only
  const late = { userId: 'u1', rowId: 'row-3', localId: 33, metal: 'gold' };
  assert.equal(queuedNotSending([byRow], new Set([late]), 'u1'), 1);
});

test('a delete still out from before a sign out takes nothing off a new one', () => {
  const hung = { userId: 'u1', rowId: 'row-old', localId: 44, metal: 'platinum' };
  assert.equal(queuedNotSending([byRow, byLocal], new Set([hung]), 'u1'), 2);
  // Nor does another account's
  assert.equal(queuedNotSending([byRow], new Set([{ ...byRow, userId: 'u2' }]), 'u1'), 1);
});

const app = readFileSync(new URL('../../App.js', import.meta.url), 'utf8');

test('the sync sends queued deletes after the edits and before it fetches, and keeps the rest out of the cloud copy', () => {
  const start = app.indexOf('const syncHoldingsWithSupabase = async');
  const body = app.slice(start, app.indexOf('// A change away from a signed-in account stops', start));
  const edits = body.indexOf('unsent = unsentEdits.length;');
  const send = body.indexOf('await sendAllWithin(toDelete,');
  const fetch = body.indexOf('const runSync = () => fullSync(');
  assert.ok(edits > 0 && send > edits && fetch > send);
  assert.match(body, /\}\), resendsBy, accountChanged\);\n\s*if \(accountChanged\(\)\) return false;/);
  assert.match(body, /unsent \+= unsentDeletes\.length;/);
  // Each send is marked on its way, so a sign out counts it once
  const sendBody = body.slice(send, body.indexOf('resendsBy, accountChanged);', send));
  assert.match(sendBody, /const sending = deletesSendingRef\.current;\n\s*sending\.add\(entry\);\n\s*try \{/);
  assert.match(sendBody, /\} finally \{\n\s*sending\.delete\(entry\);\n\s*\}/);
  // The mark stays on until the delete lands
  assert.match(sendBody, /return await deleteHoldingFromSupabase\(supabaseUser\.id, row\.id\);/);
  assert.match(body, /withoutQueuedDeletes\(\[cloudSilver, cloudGold, cloudPlatinum, cloudPalladium\], stillQueued, supabaseUser\.id\)/);
});

test('a holding whose delete was queued never goes up, even once the delete is done', () => {
  const start = app.indexOf('const syncHoldingsWithSupabase = async');
  const body = app.slice(start, app.indexOf('// A change away from a signed-in account stops', start));
  const read = body.indexOf('const queuedDeletes = await pendingDeletes.read();');
  const filter = body.indexOf('const toUpload = withoutQueuedDeletes(toSyncLists, queuedDeletes, supabaseUser.id);');
  const upload = body.indexOf('const runSync = () => fullSync(');
  assert.ok(read > 0 && filter > read && upload > filter);
  // Filtered by the queue as read, not by what's left after the sends
  assert.doesNotMatch(body, /withoutQueuedDeletes\(toSyncLists, stillQueued/);
  assert.ok(body.indexOf('const uploadLocal = isFirstSync || toUpload.some(') > filter);
});

test('a delete that found no row leaves the queue only once the stack without its holding is stored', () => {
  const start = app.indexOf('const syncHoldingsWithSupabase = async');
  const body = app.slice(start, app.indexOf('// A change away from a signed-in account stops', start));
  assert.match(body, /if \(!row\) \{\n\s*rowless\.push\(entry\);\n(\s*\/\/.*\n)*\s*if \(!accountChanged\(\)\) deletesRowlessRef\.current\.add\(entry\);\n\s*return \{ error: null \};/);
  // dropped from the queue at once are only the deletes that went to a row
  assert.match(body, /const dropNow = doneDeletes\.filter\(\(entry\) => !rowlessDone\.includes\(entry\)\);/);
  assert.match(body, /withoutDeletes\(queue, dropNow\)/);
  assert.doesNotMatch(body, /withoutDeletes\(queue, doneDeletes\)/);
  // the rest after the stack goes into storage in the synced write
  const write = body.indexOf("await AsyncStorage.multiSet([...stackWrites, [syncKey, 'true'], [HOLDINGS_OWNER_KEY, supabaseUser.id]]);");
  const drop = body.indexOf('await pendingDeletes.update((queue) => (restoreLanded() ? queue : withoutDeletes(queue, rowlessDone)))');
  assert.ok(write > 0 && drop > write);
  assert.match(body, /const stackWrites = putBack > 0 \|\| holdsDeletes\n/);
  assert.ok(body.indexOf('if ((putBack > 0 || holdsDeletes) && restoreLanded()) return false;') < write);
});

test('a sign out leaves out a queued delete that found no row', () => {
  const rowlessEntry = { userId: 'u1', rowId: null, localId: 55, metal: 'silver' };
  const queue = [byRow, { ...rowlessEntry }];
  // Matched by holding, not by object
  assert.equal(queuedNotSending(queue, new Set(), 'u1', new Set([rowlessEntry])), 1);
});

test('a rowless mark settles only a queued delete with no row', () => {
  const mark = { userId: 'u1', rowId: null, localId: 55, metal: 'silver' };
  // An earlier delete of the holding named its row, which a lookup by local
  // id missed, so that row is still to send
  const named = { userId: 'u1', rowId: 'row-55', localId: 55, metal: 'silver' };
  assert.equal(queuedNotSending([named], new Set(), 'u1', new Set([mark])), 1);
  assert.equal(queuedNotSending([{ ...named, rowId: null }], new Set(), 'u1', new Set([mark])), 0);
  // One on its way still settles it, row or not
  assert.equal(queuedNotSending([named], new Set([mark]), 'u1', new Set([mark])), 0);
  // Another account's mark, or another holding's, settles nothing
  assert.equal(queuedNotSending([{ ...named, rowId: null }], new Set(), 'u1', new Set([{ ...mark, userId: 'u2' }])), 1);
  assert.equal(queuedNotSending([{ ...named, rowId: null }], new Set(), 'u1', new Set([{ ...mark, metal: 'gold' }])), 1);
  assert.equal(queuedNotSending([{ ...named, rowId: null }], null, 'u1', null), 1);
});

test('the sync takes a rowless delete off the queue only past the restore check and with the cloud copy in state', () => {
  const start = app.indexOf('const syncHoldingsWithSupabase = async');
  const body = app.slice(start, app.indexOf('// A change away from a signed-in account stops', start));
  const check = body.indexOf('if (restoreLanded()) {\n          if (putBack > 0) await AsyncStorage.removeItem(syncKey)');
  const state = body.indexOf('setPalladiumItems(remotePalladium);');
  const drop = body.indexOf('await pendingDeletes.update((queue) => (restoreLanded() ? queue : withoutDeletes(queue, rowlessDone)))');
  assert.ok(check > 0 && state > check && drop > state);
  assert.equal(body.split('withoutDeletes(queue, rowlessDone)').length, 2);
  // and a restore that landed while it waited gets its own sync
  assert.match(body, /withoutDeletes\(queue, rowlessDone\)\)\)\.catch\(\(\) => \{\}\);\n\s*if \(accountChanged\(\)\) return false;\n(\s*\/\/.*\n)*\s*if \(restoreLanded\(\)\) return false;\n\s*\}/);
  assert.ok(body.indexOf('setHasSyncedOnce(true);', drop) > drop);
});

test('a sign out counts queued deletes and clears them with the stack', () => {
  assert.match(app, /const deletesLeft = queuedDeletes\n\s*\? queuedNotSending\(queuedDeletes, deletesSendingRef\.current, userId, deletesRowlessRef\.current\)\n\s*: 1;\n\s*return unsentCount\(lists, userId, \{ owner, firstSync, inFlight: holdingWrites\.countFor\(userId\) \}\)\n\s*\+ deletesLeft;/);
  const start = app.indexOf('const performSignOut = async');
  const userKeys = app.slice(app.indexOf('const userKeys = [', start), app.indexOf('];', app.indexOf('const userKeys = [', start)));
  assert.match(userKeys, /PENDING_DELETES_KEY,/);
  assert.match(app, /await AsyncStorage\.multiRemove\(\[\.\.\.userKeys, \.\.\.syncedKeys\(allKeys\)\]\);\n(\s*\/\/.*\n)*\s*await clearPendingDeletes\(\);/);
  assert.match(app, /await AsyncStorage\.clear\(\);\n\s*await clearPendingDeletes\(\);/);
  // Every clear of the queue goes through the one that resets its marks
  assert.equal(app.split('pendingDeletes.clear()').length, 2);
});

test('a restore never overrides a queued delete', () => {
  assert.doesNotMatch(app, /deletesRestored/);
});

test('a sign out starts the marks on queued deletes afresh', () => {
  const start = app.indexOf('const clearPendingDeletes = () => {');
  assert.ok(start > 0);
  const body = app.slice(start, app.indexOf('};', start));
  // New sets, so a delete still out keeps marking the one it started with
  assert.match(body, /deletesSendingRef\.current = new Set\(\);\n\s*deletesRowlessRef\.current = new Set\(\);\n\s*return pendingDeletes\.clear\(\);/);
  // A stale mark from before the clear would hide a delete queued after it
  const before = { userId: 'u1', rowId: null, localId: 55, metal: 'silver' };
  const after = [{ userId: 'u1', rowId: null, localId: 55, metal: 'silver' }];
  assert.equal(queuedNotSending(after, new Set(), 'u1', new Set([before])), 0);
  assert.equal(queuedNotSending(after, new Set(), 'u1'), 1);
});

test('a delete knows when a later one of the same holding has started', () => {
  const turns = deleteTurns();
  const first = turns.start('u1', 'silver', 55);
  assert.equal(turns.isLatest('u1', 'silver', 55, first), true);
  const second = turns.start('u1', 'silver', 55);
  assert.equal(turns.isLatest('u1', 'silver', 55, first), false);
  assert.equal(turns.isLatest('u1', 'silver', 55, second), true);
  // Another holding, metal or account keeps its own count
  const otherHolding = turns.start('u1', 'silver', 56);
  const otherMetal = turns.start('u1', 'gold', 55);
  const otherAccount = turns.start('u2', 'silver', 55);
  assert.equal(turns.isLatest('u1', 'silver', 56, otherHolding), true);
  assert.equal(turns.isLatest('u1', 'gold', 55, otherMetal), true);
  assert.equal(turns.isLatest('u2', 'silver', 55, otherAccount), true);
  assert.equal(turns.isLatest('u1', 'silver', 55, second), true);
});

