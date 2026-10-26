// Run with: node --test mobile-app/src/utils/fallbackIds.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HASHED_ID_BASE, hashedIdFor, idsForFetch, idsTakenBy, rowForFetchId, rowsByFetchId } from './fallbackIds.js';

const ROW_A = '3f2b8c1e-5d4a-4b6f-9e8d-1a2b3c4d5e6f';
const ROW_B = 'a7c9e1f3-2b4d-4f6a-8c0e-9d8c7b6a5f4e';
const ROW_C = '0e1d2c3b-4a59-4687-b6a5-f4e3d2c1b0a9';
const ROW_D = 'ffffffff-ffff-4fff-bfff-ffffffffffff';

test('rows with a local_id keep it', () => {
  assert.deepEqual(idsForFetch([11, 22, 33], [ROW_A, ROW_B, ROW_C]), [11, 22, 33]);
});

test('rows with no local_id each get an id of their own', () => {
  const ids = idsForFetch([undefined, null, 0, undefined], [ROW_A, ROW_B, ROW_C, ROW_D]);
  assert.deepEqual(ids, [hashedIdFor(ROW_A), hashedIdFor(ROW_B), hashedIdFor(ROW_C), hashedIdFor(ROW_D)]);
  assert.equal(new Set(ids).size, ids.length);
});

test('a row keeps its id from one fetch to the next', () => {
  const first = idsForFetch([undefined, 7, undefined], [ROW_A, ROW_B, ROW_C]);
  // The next fetch has a new row and the order changed
  const next = idsForFetch([undefined, undefined, 7, undefined], [ROW_D, ROW_C, ROW_B, ROW_A]);
  assert.equal(next[1], first[2]);
  assert.equal(next[3], first[0]);
  assert.equal(next[2], 7);
});

test('a hashed id is a safe integer past any Date.now() id', () => {
  for (const row of [ROW_A, ROW_B, ROW_C, ROW_D, '', 'x']) {
    const id = hashedIdFor(row);
    assert.ok(Number.isSafeInteger(id));
    assert.ok(id >= HASHED_ID_BASE);
    assert.ok(id < 9e15);
  }
  assert.ok(Date.now() < HASHED_ID_BASE);
});

test('different rows hash to different ids', () => {
  const ids = new Set();
  for (let i = 0; i < 5000; i += 1) ids.add(hashedIdFor(`row-${i}`));
  assert.equal(ids.size, 5000);
});

test('a hashed id that clashes with a local_id in the fetch counts up', () => {
  const clash = hashedIdFor(ROW_B);
  assert.deepEqual(idsForFetch([clash, undefined], [ROW_A, ROW_B]), [clash, clash + 1]);
});

test('an empty or missing fetch gives no ids', () => {
  assert.deepEqual(idsForFetch([], []), []);
  assert.deepEqual(idsForFetch(undefined, undefined), []);
});

test('a local_id repeated in one fetch stays on its first row only', () => {
  const ids = idsForFetch([5, 5, undefined, 5], [ROW_A, ROW_B, ROW_C, ROW_D]);
  assert.deepEqual(ids, [5, hashedIdFor(ROW_B), hashedIdFor(ROW_C), hashedIdFor(ROW_D)]);
  assert.equal(new Set(ids).size, ids.length);
});

test('a sync finds a row with no local_id under the id its holding got', () => {
  const localIds = [7, undefined, null];
  const rowIds = [ROW_A, ROW_B, ROW_C];
  const fetched = idsForFetch(localIds, rowIds);
  const rows = rowsByFetchId(localIds, rowIds);
  assert.equal(rows.get(7), ROW_A);
  assert.equal(rows.get(fetched[1]), ROW_B);
  assert.equal(rows.get(fetched[2]), ROW_C);
  assert.equal(rows.size, 3);
});

test('a repeated local_id maps to the row its holding kept, the rest to their own', () => {
  const localIds = [5, 5, 5];
  const rowIds = [ROW_A, ROW_B, ROW_C];
  const rows = rowsByFetchId(localIds, rowIds);
  assert.equal(rows.get(5), ROW_A);
  assert.equal(rows.get(hashedIdFor(ROW_B)), ROW_B);
  assert.equal(rows.get(hashedIdFor(ROW_C)), ROW_C);
});

test('no rows map nothing', () => {
  assert.equal(rowsByFetchId([], []).size, 0);
});

test('a row with no local_id is found under the hashed id its fetch gave it', () => {
  const rows = [{ id: ROW_A }, { id: ROW_B }, { id: ROW_C }];
  const localIds = [11, undefined, 22];
  const fetched = idsForFetch(localIds, rows.map((row) => row.id));
  assert.equal(rowForFetchId(rows, localIds, fetched[1]), rows[1]);
  assert.equal(rowForFetchId(rows, localIds, 11), rows[0]);
  assert.equal(rowForFetchId(rows, localIds, 22), rows[2]);
});

test('a repeated local_id finds only the row its holding kept', () => {
  const rows = [{ id: ROW_A }, { id: ROW_B }];
  assert.equal(rowForFetchId(rows, [5, 5], 5), rows[0]);
  assert.equal(rowForFetchId(rows, [5, 5], hashedIdFor(ROW_B)), rows[1]);
});

test('an id no row carries finds nothing', () => {
  assert.equal(rowForFetchId([{ id: ROW_A }], [11], 12), null);
  assert.equal(rowForFetchId([], [], 11), null);
  assert.equal(rowForFetchId(undefined, undefined, 11), null);
});

test('findHoldingByLocalId reads every metal and finds by the id the fetch gives', () => {
  const src = readFileSync(new URL('../services/supabaseHoldings.ts', import.meta.url), 'utf8');
  const start = src.indexOf('export async function findHoldingByLocalId(');
  const fn = src.slice(start, src.indexOf('\n}\n', start));
  assert.doesNotMatch(fn, /\.eq\('metal'/);
  assert.match(fn, /const rows = newestFirst\(data \|\| \[\]\);/);
  assert.match(fn, /rowForFetchId\(rows, rows\.map\(localIdOf\), localId\)/);
  assert.match(fn, /match && match\.metal === metal \? match : null/);
});

test('the ids rows take hold each local_id and each row\'s hashed id', () => {
  const ids = idsTakenBy([11, undefined, 11], [ROW_A, ROW_B, ROW_C]);
  assert.ok(ids.has(11));
  assert.ok(ids.has(hashedIdFor(ROW_A)));
  assert.ok(ids.has(hashedIdFor(ROW_B)));
  assert.ok(ids.has(hashedIdFor(ROW_C)));
  assert.equal(ids.size, 4);
});

test('no rows take no ids', () => {
  assert.equal(idsTakenBy([], []).size, 0);
  assert.equal(idsTakenBy(undefined, undefined).size, 0);
});

test('every id a fetch gives a row is one the rows take or the live map holds', () => {
  const localIds = [5, 5, undefined];
  const rowIds = [ROW_A, ROW_B, ROW_C];
  const taken = idsTakenBy(localIds, rowIds);
  for (const id of idsForFetch(localIds, rowIds)) assert.ok(taken.has(id));
});

test('the sync skips a restored holding under any id its account\'s rows take', () => {
  const src = readFileSync(new URL('../services/supabaseHoldings.ts', import.meta.url), 'utf8');
  const start = src.indexOf('export async function syncLocalToSupabase(');
  const fn = src.slice(start, src.indexOf('\n}\n', start));
  assert.match(fn, /const existingLocalIds: Set<number> = idsTakenBy\(\n\s+\(existingHoldings \|\| \[\]\)\.map\(localIdOf\),/);
  assert.match(fn, /liveRows\.forEach\(\(_rowId, id\) => existingLocalIds\.add\(id\)\);/);
  assert.ok(fn.indexOf('liveRows.forEach(') < fn.indexOf('holdingsToUpload(items, existingLocalIds, existingRowIds)'));
});
