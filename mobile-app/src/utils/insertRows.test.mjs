// Run with: node --test mobile-app/src/utils/insertRows.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { insertRows, isRowRejection } from './insertRows.js';

// A table that refuses any row whose bad field is set, the way Postgres
// refuses a whole batch over one row
function table({ failWith = null } = {}) {
  const saved = [];
  const calls = [];
  const insert = async (batch) => {
    calls.push(batch.length);
    if (failWith) return { error: failWith(batch) };
    if (batch.some((row) => row.bad)) return { error: { code: '22003', message: 'numeric field overflow' } };
    saved.push(...batch);
    return { error: null };
  };
  return { saved, calls, insert };
}

test('data and constraint errors are row rejections', () => {
  assert.equal(isRowRejection({ code: '22003' }), true);
  assert.equal(isRowRejection({ code: '22P02' }), true);
  assert.equal(isRowRejection({ code: '23502' }), true);
});

test('network, session and row-level security errors are not', () => {
  assert.equal(isRowRejection(new TypeError('Network request failed')), false);
  assert.equal(isRowRejection({ code: '42501' }), false);
  assert.equal(isRowRejection({ code: 'PGRST301' }), false);
  assert.equal(isRowRejection(null), false);
});

test('nothing to insert makes no call', async () => {
  const t = table();
  assert.deepEqual(await insertRows([], t.insert), { insertedCount: 0, rejected: [], error: null });
  assert.deepEqual(t.calls, []);
});

test('a clean batch goes up in one insert', async () => {
  const t = table();
  const result = await insertRows([{ id: 1 }, { id: 2 }], t.insert);
  assert.deepEqual(result, { insertedCount: 2, rejected: [], error: null });
  assert.deepEqual(t.calls, [2]);
});

test('one bad row no longer holds back the rest', async () => {
  const t = table();
  const result = await insertRows([{ id: 1 }, { id: 2, bad: true }, { id: 3 }], t.insert);
  assert.deepEqual(result, { insertedCount: 2, rejected: [1], error: null });
  assert.deepEqual(t.saved.map((row) => row.id), [1, 3]);
  assert.deepEqual(t.calls, [3, 1, 1, 1]);
});

test('a lone bad row comes back rejected, not as a failed sync', async () => {
  const t = table();
  assert.deepEqual(await insertRows([{ id: 1, bad: true }], t.insert), { insertedCount: 0, rejected: [0], error: null });
});

test('a network failure fails the insert without trying rows one by one', async () => {
  const offline = new TypeError('Network request failed');
  const t = table({ failWith: () => offline });
  const result = await insertRows([{ id: 1 }, { id: 2 }], t.insert);
  assert.deepEqual(result, { insertedCount: 0, rejected: [], error: offline });
  assert.deepEqual(t.calls, [2]);
});

test('a connection lost partway through the rows stops there with an error', async () => {
  const offline = new TypeError('Network request failed');
  let call = 0;
  const insert = async (batch) => {
    call += 1;
    if (call === 1) return { error: { code: '23502' } };
    if (call === 2) return { error: null };
    return { error: offline };
  };
  const result = await insertRows([{ id: 1 }, { id: 2 }, { id: 3 }], insert);
  assert.deepEqual(result, { insertedCount: 1, rejected: [], error: offline });
  assert.equal(call, 3);
});
