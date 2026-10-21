// Run with: node --test mobile-app/src/utils/fetchAllRows.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllRows, newestFirst, PAGE_SIZE, MAX_REREADS } from './fetchAllRows.js';

const idOf = (i) => `id-${String(i).padStart(6, '0')}`;
// Server insert times. Ids are random, so a row's id says nothing about when
// it went in: a row added later can sort anywhere by id.
const atOf = (i) => `2026-10-21T00:${String(Math.floor(i / 60) % 60).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}.000000+00:00`;

const unquote = (v) => (v.startsWith('"') ? v.slice(1, -1).replace(/\\(.)/g, '$1') : v);

// A table that serves the queries fetchAllRows makes the way PostgREST does:
// .gt('id'), .is / .not on created_at, the (created_at, id) keyset .or(),
// .order() and .limit(). It can fail on a given call and change between calls.
function table(n, { failOnCall = -1, between = null } = {}) {
  let rows = Array.from({ length: n }, (_, i) => ({ id: idOf(i * 10), created_at: atOf(i) }));
  const calls = [];
  const makeQuery = () => {
    const filters = [];
    let after = null;
    let keyset = null;
    const orders = [];
    const q = {
      gt: (col, value) => { assert.equal(col, 'id'); after = value; filters.push((r) => r.id > value); return q; },
      is: (col, value) => { assert.equal(col, 'created_at'); assert.equal(value, null); filters.push((r) => r.created_at == null); return q; },
      not: (col, op, value) => { assert.deepEqual([col, op, value], ['created_at', 'is', null]); filters.push((r) => r.created_at != null); return q; },
      or: (expr) => {
        const m = expr.match(/^created_at\.gt\.("(?:[^"\\]|\\.)*"),and\(created_at\.eq\.("(?:[^"\\]|\\.)*"),id\.gt\.("(?:[^"\\]|\\.)*")\)$/);
        assert.ok(m, expr);
        const at = unquote(m[1]);
        assert.equal(unquote(m[2]), at);
        const id = unquote(m[3]);
        keyset = { at, id };
        filters.push((r) => r.created_at > at || (r.created_at === at && r.id > id));
        return q;
      },
      order: (col, opts) => { assert.deepEqual(opts, { ascending: true }); orders.push(col); return q; },
      limit: async (size) => {
        calls.push({ after, keyset, orders: orders.join(','), size });
        if (calls.length - 1 === failOnCall) return { data: null, error: { message: 'boom' } };
        const cmp = (a, b) => {
          for (const col of orders) {
            if (a[col] !== b[col]) return a[col] < b[col] ? -1 : 1;
          }
          return 0;
        };
        const page = rows.filter((r) => filters.every((f) => f(r))).sort(cmp).slice(0, size);
        if (between) rows = between(rows, calls.length);
        return { data: page, error: null };
      },
    };
    return q;
  };
  return { makeQuery, calls };
}

// The requests a multi-page read makes: pages in insert order, then the rows
// with no created_at by id
const insertOrderCalls = (calls) => calls.filter((c) => c.orders === 'created_at,id');

test('the page size is Supabase default max rows', () => {
  assert.equal(PAGE_SIZE, 1000);
});

test('a short stack takes one request', async () => {
  const t = table(3);
  const { data, error } = await fetchAllRows(t.makeQuery);
  assert.equal(error, null);
  assert.equal(data.length, 3);
  assert.deepEqual(t.calls, [{ after: null, keyset: null, orders: 'id', size: 1000 }]);
});

test('an empty stack reads as no rows', async () => {
  const { data, error } = await fetchAllRows(table(0).makeQuery);
  assert.equal(error, null);
  assert.deepEqual(data, []);
});

test('rows past the first page all come back once, each page after the last row in insert order', async () => {
  const t = table(2501);
  const { data, error } = await fetchAllRows(t.makeQuery);
  assert.equal(error, null);
  assert.equal(data.length, 2501);
  assert.equal(new Set(data.map((r) => r.id)).size, 2501);
  // One request by id finds a full page, then two reads in insert order
  // match. Each read pages after the last row's created_at and id, then
  // looks for rows with no created_at.
  const keysets = insertOrderCalls(t.calls).map((c) => c.keyset && c.keyset.id);
  assert.deepEqual(keysets, [null, idOf(9990), idOf(19990), null, idOf(9990), idOf(19990)]);
  assert.equal(t.calls.length, 1 + 2 * (3 + 1));
  assert.equal(t.calls.filter((c) => c.orders === 'id').length, 3);
});

test('a stack of exactly one page asks once more and stops on the empty page', async () => {
  const t = table(1000);
  const { data } = await fetchAllRows(t.makeQuery);
  assert.equal(data.length, 1000);
  // The full first page, then two reads of a full page, an empty one and
  // the rows with no created_at
  assert.equal(t.calls.length, 1 + 2 * 3);
});

test('a row deleted from an earlier page mid-read skips nothing', async () => {
  // After page one, another device deletes the first row. The read again
  // drops it, and every other row is there once.
  const t = table(1500, { between: (rows, call) => (call === 1 ? rows.slice(1) : rows) });
  const { data } = await fetchAllRows(t.makeQuery);
  assert.equal(data.length, 1499);
  assert.equal(new Set(data.map((r) => r.id)).size, 1499);
  assert.ok(!data.some((r) => r.id === idOf(0)));
});

test('a row added mid-read is still read, once, wherever its id sorts', async () => {
  // Its id sorts below the cursor, but it went in last, so it sorts last
  const t = table(1500, { between: (rows, call) => (call === 2 ? [...rows, { id: idOf(5), created_at: atOf(5000) }] : rows) });
  const { data } = await fetchAllRows(t.makeQuery);
  assert.equal(data.length, 1501);
  assert.equal(new Set(data.map((r) => r.id)).size, 1501);
  assert.ok(data.some((r) => r.id === idOf(5)));
});

test('a stack that keeps changing is read a few more times and then counts as an error', async () => {
  let next = 1;
  const t = table(1500, { between: (rows) => [...rows, { id: idOf(next++) }] });
  const { data, error } = await fetchAllRows(t.makeQuery);
  assert.equal(data, null);
  assert.match(error.message, /kept changing/);
  // The first request, then each read of 1500 or more rows takes two pages
  // and the look for rows with no created_at
  assert.equal(t.calls.length, 1 + 3 * (1 + MAX_REREADS));
});

test('a row added during the read again is read, not left to the next sync', async () => {
  // Added while the second read pages, with an id below its cursor. It sorts
  // last by insert time, so the second read finds it, the two reads differ
  // and a third read confirms it.
  const t = table(1500, { between: (rows, call) => (call === 5 ? [...rows, { id: idOf(5), created_at: atOf(5000) }] : rows) });
  const { data, error } = await fetchAllRows(t.makeQuery);
  assert.equal(error, null);
  assert.equal(data.length, 1501);
  assert.ok(data.some((r) => r.id === idOf(5)));
  assert.equal(t.calls.length, 1 + 3 * 3);
});

test('rows with no created_at are read too', async () => {
  const t = table(1500, { between: (rows, call) => (call === 1 ? [...rows, { id: idOf(7), created_at: null }] : rows) });
  const { data, error } = await fetchAllRows(t.makeQuery);
  assert.equal(error, null);
  assert.equal(data.length, 1501);
  assert.equal(data.filter((r) => r.id === idOf(7)).length, 1);
});

test('rows that share one insert time page past each other by id', async () => {
  // A batch insert gives every row the same created_at, so the cursor's id
  // part is what moves the read on
  const shared = '2026-10-21T00:00:00.123456+00:00';
  const t = table(2200, { between: (rows) => rows.map((r) => ({ ...r, created_at: shared })) });
  await t.makeQuery().limit(1);
  const { data, error } = await fetchAllRows(t.makeQuery);
  assert.equal(error, null);
  assert.equal(data.length, 2200);
  assert.equal(new Set(data.map((r) => r.id)).size, 2200);
});

test('a timestamp keeps its + and : inside the quoted cursor', async () => {
  const t = table(1500);
  await fetchAllRows(t.makeQuery);
  const keyed = insertOrderCalls(t.calls).find((c) => c.keyset);
  assert.match(keyed.keyset.at, /\+00:00$/);
});

test('an error on a read again returns no rows, never part of the stack', async () => {
  const t = table(1500, { failOnCall: 2 });
  const { data, error } = await fetchAllRows(t.makeQuery);
  assert.equal(data, null);
  assert.equal(error.message, 'boom');
});

test('the read again returns its newer values', async () => {
  const t = table(1500, { between: (rows, call) => (call === 2 ? rows.map((r) => ({ ...r, v: 2 })) : rows) });
  const { data } = await fetchAllRows(t.makeQuery);
  assert.equal(data.length, 1500);
  assert.ok(data.every((r) => r.v === 2));
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

test('a lookup that asks not to settle reads once', async () => {
  let next = 1;
  const t = table(1500, { between: (rows) => [...rows, { id: idOf(next++) }] });
  const { data, error } = await fetchAllRows(t.makeQuery, undefined, { settle: false });
  assert.equal(error, null);
  assert.ok(data.length >= 1500);
  assert.equal(t.calls.length, 2);
});

test('findHoldingByLocalId reads once', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../services/supabaseHoldings.ts', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('export async function findHoldingByLocalId('));
  assert.match(fn.slice(0, fn.indexOf('if (error) throw error;')), /\{ settle: false \}/);
});
