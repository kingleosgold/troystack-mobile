// Run with: node --test mobile-app/src/utils/fetchAllRows.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllRows, newestFirst, PAGE_SIZE } from './fetchAllRows.js';

const idOf = (i) => `id-${String(i).padStart(6, '0')}`;

// A table that serves .gt('id').order('id').limit() the way PostgREST does,
// can fail on a given call, and can change between calls
function table(n, { failOnCall = -1, between = null } = {}) {
  let rows = Array.from({ length: n }, (_, i) => ({ id: idOf(i * 10) }));
  const calls = [];
  const makeQuery = () => {
    let after = null;
    const q = {
      gt: (col, value) => { assert.equal(col, 'id'); after = value; return q; },
      order: (col, opts) => { assert.equal(col, 'id'); assert.deepEqual(opts, { ascending: true }); return q; },
      limit: async (size) => {
        calls.push({ after, size });
        if (calls.length - 1 === failOnCall) return { data: null, error: { message: 'boom' } };
        const sorted = [...rows].sort((a, b) => (a.id < b.id ? -1 : 1));
        const page = sorted.filter((r) => after == null || r.id > after).slice(0, size);
        if (between) rows = between(rows, calls.length);
        return { data: page, error: null };
      },
    };
    return q;
  };
  return { makeQuery, calls };
}

test('the page size is Supabase default max rows', () => {
  assert.equal(PAGE_SIZE, 1000);
});

test('a short stack takes one request', async () => {
  const t = table(3);
  const { data, error } = await fetchAllRows(t.makeQuery);
  assert.equal(error, null);
  assert.equal(data.length, 3);
  assert.deepEqual(t.calls, [{ after: null, size: 1000 }]);
});

test('an empty stack reads as no rows', async () => {
  const { data, error } = await fetchAllRows(table(0).makeQuery);
  assert.equal(error, null);
  assert.deepEqual(data, []);
});

test('rows past the first page all come back once, each page after the last id', async () => {
  const t = table(2501);
  const { data, error } = await fetchAllRows(t.makeQuery);
  assert.equal(error, null);
  assert.equal(data.length, 2501);
  assert.equal(new Set(data.map((r) => r.id)).size, 2501);
  assert.deepEqual(t.calls.map((c) => c.after), [null, idOf(9990), idOf(19990)]);
});

test('a stack of exactly one page asks once more and stops on the empty page', async () => {
  const t = table(1000);
  const { data } = await fetchAllRows(t.makeQuery);
  assert.equal(data.length, 1000);
  assert.equal(t.calls.length, 2);
});

test('a row deleted from an earlier page mid-read skips nothing', async () => {
  // After page one, another device deletes the first row
  const t = table(1500, { between: (rows, call) => (call === 1 ? rows.slice(1) : rows) });
  const { data } = await fetchAllRows(t.makeQuery);
  assert.equal(data.length, 1500);
  assert.equal(new Set(data.map((r) => r.id)).size, 1500);
});

test('a row added to an earlier page mid-read repeats nothing', async () => {
  const t = table(1500, { between: (rows, call) => (call === 1 ? [...rows, { id: idOf(5) }] : rows) });
  const { data } = await fetchAllRows(t.makeQuery);
  assert.equal(data.length, 1500);
  assert.equal(new Set(data.map((r) => r.id)).size, 1500);
});

test('an error on a later page returns no rows, not part of them', async () => {
  const { data, error } = await fetchAllRows(table(1500, { failOnCall: 1 }).makeQuery);
  assert.equal(data, null);
  assert.deepEqual(error, { message: 'boom' });
});

test('a null page reads as empty', async () => {
  const q = { gt: () => q, order: () => q, limit: async () => ({ data: null, error: null }) };
  const { data, error } = await fetchAllRows(() => q);
  assert.equal(error, null);
  assert.deepEqual(data, []);
});

test('newestFirst sorts by created_at descending, then id, without changing its input', () => {
  const rows = [
    { id: 'b', created_at: '2026-10-01T00:00:00+00:00' },
    { id: 'c', created_at: '2026-10-02T00:00:00+00:00' },
    { id: 'a', created_at: '2026-10-01T00:00:00+00:00' },
    { id: 'd', created_at: null },
  ];
  assert.deepEqual(newestFirst(rows).map((r) => r.id), ['c', 'a', 'b', 'd']);
  assert.deepEqual(rows.map((r) => r.id), ['b', 'c', 'a', 'd']);
});
