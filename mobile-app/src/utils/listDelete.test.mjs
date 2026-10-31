// Run with: node --test mobile-app/src/utils/listDelete.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sendListDelete } from './listDelete.js';
import { deleteQueueStore, deleteTurns, parseDeleteQueue, queuedNotSending, PENDING_DELETES_KEY } from './deleteQueue.js';

// Storage whose writes can be made to fail, logging each step in order
const memory = (log) => {
  const data = {};
  const failing = { set: 0 };
  return {
    data,
    failing,
    async getItem(key) { return key in data ? data[key] : null; },
    async setItem(key, value) {
      if (failing.set > 0) {
        failing.set -= 1;
        log.push('queue-fail');
        throw new Error('disk full');
      }
      log.push(`queue:${parseDeleteQueue(value).map((e) => `${e.localId}/${e.rowId || '-'}`).join(',')}`);
      data[key] = value;
    },
    async removeItem(key) { log.push('queue:'); delete data[key]; },
  };
};

// A delete of local id 55 in silver for u1, with every part it takes
const setup = (over = {}) => {
  const log = [];
  const storage = memory(log);
  const pendingDeletes = deleteQueueStore(storage);
  const marks = { sending: new Set(), rowless: new Set() };
  const turns = deleteTurns();
  const turn = turns.start('u1', 'silver', 55);
  const state = { account: true, putBack: 0, noted: 0, sendingDuringSend: null };
  const ctx = {
    entry: { userId: 'u1', rowId: null, localId: 55, metal: 'silver' },
    pendingDeletes,
    sendingSet: () => marks.sending,
    rowlessSet: () => marks.rowless,
    sameAccount: () => state.account,
    isLatest: () => turns.isLatest('u1', 'silver', 55, turn),
    earlierWrites: Promise.resolve(true),
    knownRow: () => null,
    findRow: async (localId, metal) => {
      log.push(`find:${metal}/${localId}`);
      return { id: 'row-55' };
    },
    deleteRow: async (rowId) => {
      log.push(`delete:${rowId}`);
      state.sendingDuringSend = marks.sending.size;
      return { error: null };
    },
    noteQueued: () => { state.noted += 1; },
    putBack: () => { state.putBack += 1; },
    ...over,
  };
  const queue = () => parseDeleteQueue(storage.data[PENDING_DELETES_KEY]);
  return { ctx, log, storage, pendingDeletes, marks, turns, state, queue };
};

test('a delete with a row is queued before it is sent and taken off once it lands', async () => {
  const { ctx, log, state, queue, marks } = setup();
  const result = await sendListDelete({ ...ctx, entry: { ...ctx.entry, rowId: 'row-55' } });
  assert.equal(result, 'deleted');
  assert.deepEqual(log, ['queue:55/row-55', 'delete:row-55', 'queue:']);
  assert.deepEqual(queue(), []);
  // Marked on its way while it sends, and the mark comes off after
  assert.equal(state.sendingDuringSend, 1);
  assert.equal(marks.sending.size, 0);
  assert.equal(state.noted, 0);
});

test('a delete with no row goes to the row its add landed in, without a lookup', async () => {
  const { ctx, log, queue } = setup({ knownRow: () => 'row-known' });
  assert.equal(await sendListDelete(ctx), 'deleted');
  assert.deepEqual(log, ['queue:55/-', 'delete:row-known', 'queue:']);
  assert.deepEqual(queue(), []);
});

test('a delete with no row known finds it by local id and comes off once it lands', async () => {
  const { ctx, log, queue } = setup();
  assert.equal(await sendListDelete(ctx), 'deleted');
  assert.deepEqual(log, ['queue:55/-', 'find:silver/55', 'delete:row-55', 'queue:']);
  assert.deepEqual(queue(), []);
});

test('a delete that finds no row stays queued for the sync and is marked rowless', async () => {
  const { ctx, queue, marks, state } = setup({ findRow: async () => null });
  assert.equal(await sendListDelete(ctx), 'rowless');
  assert.deepEqual(queue().map((e) => e.localId), [55]);
  assert.equal(marks.rowless.size, 1);
  // Sign Out leaves it out of the unsent count
  assert.equal(queuedNotSending(queue(), marks.sending, 'u1', marks.rowless), 0);
  assert.equal(state.noted, 0);
});

test('a rowless delete is not marked once a later delete of the same holding has started', async () => {
  const { ctx, turns, marks, queue } = setup({
    findRow: async () => {
      turns.start('u1', 'silver', 55);
      return null;
    },
  });
  assert.equal(await sendListDelete(ctx), 'rowless');
  assert.equal(marks.rowless.size, 0);
  assert.equal(queue().length, 1);
});

test('a delete whose earlier writes are still out never trusts a lookup and stays queued', async () => {
  const { ctx, log, state, queue } = setup({ earlierWrites: Promise.resolve(false) });
  assert.equal(await sendListDelete(ctx), 'queued');
  assert.ok(!log.some((step) => step.startsWith('find:') || step.startsWith('delete:')));
  assert.deepEqual(queue().map((e) => e.localId), [55]);
  assert.equal(state.noted, 1);
  assert.equal(state.putBack, 0);
});

test('a lookup that throws leaves the delete queued with the notice', async () => {
  const { ctx, state, queue } = setup({ findRow: async () => { throw new Error('offline'); } });
  assert.equal(await sendListDelete(ctx), 'queued');
  assert.deepEqual(queue().map((e) => e.localId), [55]);
  assert.equal(state.noted, 1);
  assert.equal(state.putBack, 0);
});

test('a failed delete stays queued and takes the row the lookup found', async () => {
  const { ctx, log, state, queue } = setup({
    deleteRow: async (rowId) => { log.push(`delete:${rowId}`); return { error: new Error('500') }; },
  });
  assert.equal(await sendListDelete(ctx), 'queued');
  assert.deepEqual(queue(), [{ userId: 'u1', rowId: 'row-55', localId: 55, metal: 'silver' }]);
  assert.equal(state.noted, 1);
});

test('a failed delete whose queue can\'t be saved puts the holding back', async () => {
  const { ctx, storage, state, marks } = setup({ deleteRow: async () => ({ error: new Error('500') }) });
  storage.failing.set = 2;
  assert.equal(await sendListDelete(ctx), 'restored');
  assert.equal(state.putBack, 1);
  assert.equal(state.noted, 0);
  // Never queued, so it never went on the sending marks
  assert.equal(marks.sending.size, 0);
});

test('a queue that fails first and saves on the retry keeps the holding off', async () => {
  const { ctx, storage, state, queue } = setup({ deleteRow: async () => ({ error: new Error('500') }) });
  storage.failing.set = 1;
  assert.equal(await sendListDelete(ctx), 'queued');
  assert.equal(state.putBack, 0);
  assert.equal(queue().length, 1);
});

test('a queue that can\'t be saved still sends the delete', async () => {
  const { ctx, storage, log, state } = setup({ entry: { userId: 'u1', rowId: 'row-55', localId: 55, metal: 'silver' } });
  storage.failing.set = 1;
  assert.equal(await sendListDelete(ctx), 'deleted');
  assert.deepEqual(log, ['queue-fail', 'delete:row-55']);
  // Not on the queue, so not marked sending either
  assert.equal(state.sendingDuringSend, 0);
});

test('a delete started after its account left is not queued under the next one', async () => {
  const { ctx, log, state, queue } = setup({ deleteRow: async (rowId) => { log.push(`delete:${rowId}`); return { error: new Error('500') }; } });
  state.account = false;
  assert.equal(await sendListDelete(ctx), 'left');
  assert.deepEqual(log, ['find:silver/55', 'delete:row-55']);
  assert.deepEqual(queue(), []);
  assert.equal(state.putBack, 0);
  assert.equal(state.noted, 0);
});

test('a delete that fails after a sign out is not queued again or put back', async () => {
  const { ctx, state, log, queue } = setup({
    deleteRow: async (rowId) => {
      log.push(`delete:${rowId}`);
      state.account = false;
      return { error: new Error('500') };
    },
  });
  assert.equal(await sendListDelete(ctx), 'left');
  // Only the first queue write, from before the sign out, landed
  assert.deepEqual(log, ['queue:55/-', 'find:silver/55', 'delete:row-55']);
  assert.equal(queue().length, 1);
  assert.equal(state.putBack, 0);
  assert.equal(state.noted, 0);
});

test('a delete that lands after a sign out touches nothing the new session queued', async () => {
  const { ctx, state, marks, log } = setup({
    findRow: async () => {
      state.account = false;
      return null;
    },
  });
  assert.equal(await sendListDelete(ctx), 'left');
  assert.equal(marks.rowless.size, 0);
  assert.ok(!log.includes('queue:'));
});

test('a delete that reaches its row after a sign out leaves the new queue alone', async () => {
  const { ctx, state, log, queue } = setup({
    deleteRow: async (rowId) => {
      log.push(`delete:${rowId}`);
      state.account = false;
      return { error: null };
    },
  });
  assert.equal(await sendListDelete({ ...ctx, entry: { ...ctx.entry, rowId: 'row-55' } }), 'left');
  // Nothing written to the queue after the send, so a delete the new
  // session queued for the same holding stays
  assert.deepEqual(log, ['queue:55/row-55', 'delete:row-55']);
  assert.equal(queue().length, 1);
});

test('a holding with a row whose send fails stays queued by that row with the notice', async () => {
  const { ctx, state, queue } = setup({ deleteRow: async () => ({ error: new Error('500') }) });
  assert.equal(await sendListDelete({ ...ctx, entry: { ...ctx.entry, rowId: 'row-55' } }), 'queued');
  assert.deepEqual(queue(), [{ userId: 'u1', rowId: 'row-55', localId: 55, metal: 'silver' }]);
  assert.equal(state.noted, 1);
  assert.equal(state.putBack, 0);
});

test('a holding is not put back once the account changed while the retry queue write failed', async () => {
  const { ctx, state, storage } = setup({ deleteRow: async () => ({ error: new Error('500') }) });
  let writes = 0;
  storage.setItem = async () => {
    writes += 1;
    // The first write fails, and the retry fails as a sign out happens
    if (writes === 2) state.account = false;
    throw new Error('disk full');
  };
  assert.equal(await sendListDelete(ctx), 'left');
  assert.equal(writes, 2);
  assert.equal(state.putBack, 0);
});

test('the sending mark comes off the set it went on, even after a sign out swaps the sets', async () => {
  const first = new Set();
  let current = first;
  const { ctx } = setup({
    sendingSet: () => current,
    deleteRow: async () => {
      assert.equal(first.size, 1);
      current = new Set();
      return { error: null };
    },
  });
  await sendListDelete({ ...ctx, entry: { ...ctx.entry, rowId: 'row-55' } });
  assert.equal(first.size, 0);
  assert.equal(current.size, 0);
});

test('a delete that joins the queue clears an earlier rowless mark for its holding', async () => {
  const { ctx, marks } = setup();
  const earlier = { userId: 'u1', rowId: null, localId: 55, metal: 'silver' };
  const otherHolding = { userId: 'u1', rowId: null, localId: 56, metal: 'silver' };
  marks.rowless.add(earlier);
  marks.rowless.add(otherHolding);
  await sendListDelete(ctx);
  assert.deepEqual([...marks.rowless], [otherHolding]);
});

test('a delete that never joins the queue keeps the earlier rowless mark', async () => {
  const { ctx, marks, state } = setup();
  const earlier = { userId: 'u1', rowId: null, localId: 55, metal: 'silver' };
  marks.rowless.add(earlier);
  state.account = false;
  await sendListDelete(ctx);
  assert.deepEqual([...marks.rowless], [earlier]);
});

test('a delete that joins the queue only on the retry clears the earlier rowless mark then', async () => {
  const { ctx, marks, storage } = setup({ deleteRow: async () => ({ error: new Error('500') }) });
  const earlier = { userId: 'u1', rowId: null, localId: 55, metal: 'silver' };
  marks.rowless.add(earlier);
  storage.failing.set = 1;
  assert.equal(await sendListDelete(ctx), 'queued');
  assert.equal(marks.rowless.size, 0);
});

test('the latest delete marks the holding rowless when its own queue write failed', async () => {
  const { ctx, storage, pendingDeletes, turns, marks, queue } = setup({ findRow: async () => null });
  // An earlier delete of the holding is queued and left its mark to this one
  await pendingDeletes.update(() => [{ userId: 'u1', rowId: null, localId: 55, metal: 'silver' }]);
  const turn = turns.start('u1', 'silver', 55);
  // Its own queue write fails, here on the read before it
  const getItem = storage.getItem;
  let reads = 0;
  storage.getItem = async (key) => {
    reads += 1;
    if (reads === 1) throw new Error('disk unreadable');
    return getItem(key);
  };
  const result = await sendListDelete({ ...ctx, isLatest: () => turns.isLatest('u1', 'silver', 55, turn) });
  assert.equal(result, 'rowless');
  assert.equal(queue().length, 1);
  assert.equal(marks.rowless.size, 1);
  // Sign Out leaves the earlier entry out of the unsent count
  assert.equal(queuedNotSending(queue(), marks.sending, 'u1', marks.rowless), 0);
});

test('a rowless delete whose queue write failed is not marked once a later delete started', async () => {
  const { ctx, storage, turns, marks } = setup({
    findRow: async () => {
      turns.start('u1', 'silver', 55);
      return null;
    },
  });
  storage.failing.set = 1;
  assert.equal(await sendListDelete(ctx), 'rowless');
  assert.equal(marks.rowless.size, 0);
});

test('the sending mark comes off after a delete that stays queued', async () => {
  const { ctx, marks } = setup({ findRow: async () => { throw new Error('offline'); } });
  assert.equal(await sendListDelete(ctx), 'queued');
  assert.equal(marks.sending.size, 0);
});

test('the sending mark comes off after a delete that finds no row', async () => {
  let during = null;
  const { ctx, marks } = setup({
    findRow: async () => {
      during = marks.sending.size;
      return null;
    },
  });
  assert.equal(await sendListDelete(ctx), 'rowless');
  assert.equal(during, 1);
  assert.equal(marks.sending.size, 0);
});

test('a delete that lands but can\'t come off the queue is left for the sync', async () => {
  const warned = [];
  const { ctx, storage, queue, state } = setup({
    entry: { userId: 'u1', rowId: 'row-55', localId: 55, metal: 'silver' },
    warn: (message) => warned.push(message),
  });
  storage.removeItem = async () => { throw new Error('disk full'); };
  assert.equal(await sendListDelete(ctx), 'deleted');
  assert.equal(queue().length, 1);
  assert.deepEqual(warned, ['Failed to unqueue the delete:']);
  assert.equal(state.noted, 0);
  assert.equal(state.putBack, 0);
});

// The wiring in App.js, read as source like the other sync tests
const app = readFileSync(new URL('../../App.js', import.meta.url), 'utf8');

test('the list delete sends through sendListDelete inside the write tracker', () => {
  const start = app.indexOf('const deleteGen = stackGenRef.current;');
  assert.ok(start > 0);
  const body = app.slice(start, app.indexOf('// Close detail view if open', start));
  // The turn and the queue's clears are taken at the confirm, before any await
  assert.match(body, /^const deleteGen = stackGenRef\.current;\n\s*const deleteTurn = deleteTurnsRef\.current\.start\(supabaseUser\?\.id, metal, id\);/);
  assert.match(body, /const deleteQueueClears = pendingDeletes\.clears\(\);\n(\s*\/\/.*\n)*?\s*const sameAccount = \(\) => userIdRef\.current === supabaseUser\?\.id && pendingDeletes\.clears\(\) === deleteQueueClears;/);
  assert.ok(body.indexOf('const deleteTurn =') < body.indexOf('await '));
  assert.ok(body.indexOf('const deleteQueueClears') < body.indexOf('await '));
  assert.match(body, /await trackHoldingWrite\(\(\) => sendListDelete\(\{/);
  assert.match(body, /entry: \{ userId: supabaseUser\.id, rowId: itemToDelete\.supabase_id \|\| null, localId: id, metal \},/);
  // The queue and the account check the delete runs against
  assert.match(body, /\n\s*pendingDeletes,\n/);
  assert.match(body, /\n\s*sameAccount,\n/);
  // The marks sets are read when used, since a sign out swaps them
  assert.match(body, /sendingSet: \(\) => deletesSendingRef\.current,\n\s*rowlessSet: \(\) => deletesRowlessRef\.current,/);
  assert.match(body, /isLatest: \(\) => deleteTurnsRef\.current\.isLatest\(supabaseUser\.id, metal, id, deleteTurn\),/);
  assert.match(body, /deleteRow: \(rowId\) => deleteHoldingFromSupabase\(supabaseUser\.id, rowId\),/);
  assert.match(body, /knownRow: \(\) => knownRowsRef\.current\.rowFor\(id, supabaseUser\.id\),/);
  assert.match(body, /noteQueued: \(\) => noteCloudMiss\('edit', supabaseUser\.id\),/);
  // The holding goes back only into the stack it was deleted from
  assert.match(body, /putBack: \(\) => \{\n\s*if \(stackGenRef\.current !== deleteGen\) return;\n\s*setter\(prev => withHoldingRestored\(prev, removed, removedIndex\)\);/);
  assert.match(app, /const deleteTurnsRef = useRef\(null\);\n\s*if \(!deleteTurnsRef\.current\) deleteTurnsRef\.current = deleteTurns\(\);/);
});
