// Run with: node --test mobile-app/src/utils/fetchAllRows.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllRows, PAGE_SIZE } from './fetchAllRows.js';

// A table of n rows that serves .range() the way PostgREST does and can fail
// on a given call
function table(n, { failOnCall = -1 } = {}) {
  const rows = Array.from({ length: n }, (_, i) => ({ id: i }));
  const ranges = [];
  const makeQuery = () => ({
    range: async (from, to) => {
      ranges.push([from, to]);
      if (ranges.length - 1 === failOnCall) return { data: null, error: { message: 'boom' } };
      return { data: rows.slice(from, to + 1), error: null };
    },
  });
  return { makeQuery, ranges };
}

test('the page size is Supabase default max rows', () => {
  assert.equal(PAGE_SIZE, 1000);
});

test('a short stack takes one request', async () => {
  const t = table(3);
  const { data, error } = await fetchAllRows(t.makeQuery);
  assert.equal(error, null);
  assert.equal(data.length, 3);
  assert.deepEqual(t.ranges, [[0, 999]]);
});

test('an empty stack reads as no rows', async () => {
  const t = table(0);
  const { data, error } = await fetchAllRows(t.makeQuery);
  assert.equal(error, null);
  assert.deepEqual(data, []);
});

test('rows past the first page all come back, in order', async () => {
  const t = table(2501);
  const { data, error } = await fetchAllRows(t.makeQuery);
  assert.equal(error, null);
  assert.equal(data.length, 2501);
  assert.deepEqual(data.map((r) => r.id), Array.from({ length: 2501 }, (_, i) => i));
  assert.deepEqual(t.ranges, [[0, 999], [1000, 1999], [2000, 2999]]);
});

test('a stack of exactly one page asks once more and stops on the empty page', async () => {
  const t = table(1000);
  const { data } = await fetchAllRows(t.makeQuery);
  assert.equal(data.length, 1000);
  assert.deepEqual(t.ranges, [[0, 999], [1000, 1999]]);
});

test('an error on a later page returns no rows, not part of them', async () => {
  const t = table(1500, { failOnCall: 1 });
  const { data, error } = await fetchAllRows(t.makeQuery);
  assert.equal(data, null);
  assert.deepEqual(error, { message: 'boom' });
});

test('a null page reads as empty', async () => {
  const { data, error } = await fetchAllRows(() => ({ range: async () => ({ data: null, error: null }) }));
  assert.equal(error, null);
  assert.deepEqual(data, []);
});
