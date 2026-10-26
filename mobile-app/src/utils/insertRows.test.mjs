// Run with: node --test mobile-app/src/utils/insertRows.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { insertRows, insertUploads, isRowRejection } from './insertRows.js';

const holdingsSource = readFileSync(new URL('../services/supabaseHoldings.ts', import.meta.url), 'utf8');

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
  assert.equal(isRowRejection({ code: '' }), false);
  assert.equal(isRowRejection(null), false);
});

test("a foreign key break is the account's, not the row's", () => {
  assert.equal(isRowRejection({ code: '23503' }), false);
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
  assert.deepEqual(t.calls, [3, 1, 2, 1, 1]);
});

test('one bad row in a large stack costs a few requests, not one per row', async () => {
  const t = table();
  const rows = Array.from({ length: 200 }, (_, i) => ({ id: i, bad: i === 137 }));
  const result = await insertRows(rows, t.insert);
  assert.deepEqual(result, { insertedCount: 199, rejected: [137], error: null });
  assert.deepEqual(t.saved.map((row) => row.id), rows.filter((row) => !row.bad).map((row) => row.id));
  assert.ok(t.calls.length <= 1 + 2 * Math.ceil(Math.log2(200)), `took ${t.calls.length} requests`);
});

test('several bad rows come back in order and every good row goes up once', async () => {
  const t = table();
  const bad = new Set([0, 5, 6, 31, 49]);
  const rows = Array.from({ length: 50 }, (_, i) => ({ id: i, bad: bad.has(i) }));
  const result = await insertRows(rows, t.insert);
  assert.deepEqual(result, { insertedCount: 45, rejected: [0, 5, 6, 31, 49], error: null });
  assert.deepEqual(t.saved.map((row) => row.id), rows.filter((row) => !row.bad).map((row) => row.id));
});

test('every row bad comes back rejected with nothing saved', async () => {
  const t = table();
  const rows = [{ id: 1, bad: true }, { id: 2, bad: true }, { id: 3, bad: true }];
  assert.deepEqual(await insertRows(rows, t.insert), { insertedCount: 0, rejected: [0, 1, 2], error: null });
  assert.deepEqual(t.saved, []);
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

test('a connection lost partway through the halves stops there with an error', async () => {
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

test('a connection lost inside a split half keeps what went up and the rows refused so far', async () => {
  const offline = new TypeError('Network request failed');
  const sent = [];
  const insert = async (batch) => {
    sent.push(batch.map((row) => row.id));
    if (sent.length === 5) return { error: offline };
    if (batch.some((row) => row.bad)) return { error: { code: '22003' } };
    return { error: null };
  };
  // [1..4] refused, [1,2] refused, [1] refused alone, [2] in, [3,4] offline
  const result = await insertRows([{ id: 1, bad: true }, { id: 2 }, { id: 3 }, { id: 4 }], insert);
  assert.deepEqual(result, { insertedCount: 1, rejected: [0], error: offline });
  assert.deepEqual(sent, [[1, 2, 3, 4], [1, 2], [1], [2], [3, 4]]);
});

// Uploads as holdingsToInsert gives them, and the row each one becomes
const upload = (id, metal, bad = false) => ({ item: { id, bad }, metal });
const toRow = ({ item, metal }) => ({ local: item.id, metal, ...(item.bad ? { bad: true } : {}) });

test('each refused row comes back as the holding it came from', async () => {
  const t = table();
  const uploads = [upload(1, 'silver'), upload(2, 'silver', true), upload(3, 'gold'), upload(4, 'gold'), upload(5, 'platinum', true)];
  const result = await insertUploads(uploads, toRow, t.insert);
  assert.equal(result.insertedCount, 3);
  assert.equal(result.error, null);
  assert.deepEqual(result.rejected, [uploads[1], uploads[4]]);
  assert.deepEqual(t.saved.map((row) => [row.local, row.metal]), [[1, 'silver'], [3, 'gold'], [4, 'gold']]);
});

test('a holding id repeated across metals is refused for the right metal', async () => {
  const t = table();
  const uploads = [upload(7, 'silver'), upload(7, 'gold', true), upload(7, 'palladium')];
  const result = await insertUploads(uploads, toRow, t.insert);
  assert.deepEqual(result.rejected, [uploads[1]]);
  assert.equal(result.rejected[0].metal, 'gold');
  assert.deepEqual(t.saved.map((row) => row.metal), ['silver', 'palladium']);
});

test('the rows go up in the uploads\' order, one per upload', async () => {
  const t = table();
  const uploads = [upload(3, 'gold'), upload(1, 'silver'), upload(2, 'gold')];
  await insertUploads(uploads, toRow, t.insert);
  assert.deepEqual(t.saved, uploads.map(toRow));
});

test('no uploads make no call', async () => {
  const t = table();
  assert.deepEqual(await insertUploads([], toRow, t.insert), { insertedCount: 0, rejected: [], error: null });
  assert.deepEqual(await insertUploads(undefined, toRow, t.insert), { insertedCount: 0, rejected: [], error: null });
  assert.deepEqual(t.calls, []);
});

test('an error that is not a refusal comes back with no holding refused', async () => {
  const lost = new TypeError('Network request failed');
  const t = table({ failWith: () => lost });
  const result = await insertUploads([upload(1, 'silver'), upload(2, 'gold')], toRow, t.insert);
  assert.deepEqual(result, { insertedCount: 0, rejected: [], error: lost });
});

test('the sync inserts its uploads through insertUploads, so refusals mark their holdings', () => {
  assert.match(holdingsSource, /import \{ insertUploads \} from '\.\.\/utils\/insertRows';/);
  assert.match(holdingsSource, /await insertUploads\(\n\s+uploads,\n\s+\(\{ item, metal \}[^\n]*=> localToSupabase\(item, metal, userId\),/);
  assert.match(holdingsSource, /rejected\.push\(\.\.\.rejectedUploads\);/);
  assert.doesNotMatch(holdingsSource, /sources\[index\]/);
});
