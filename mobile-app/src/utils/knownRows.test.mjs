// Run with: node --test mobile-app/src/utils/knownRows.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { knownRows } from './knownRows.js';

const appSource = readFileSync(new URL('../../App.js', import.meta.url), 'utf8');

test('answers the row a holding went to for its own account only', () => {
  const rows = knownRows();
  rows.note(1, 'row-a', 'user-1');
  assert.equal(rows.rowFor(1, 'user-1'), 'row-a');
  assert.equal(rows.rowFor(1, 'user-2'), null);
  assert.equal(rows.rowFor(1, null), null);
  assert.equal(rows.rowFor(2, 'user-1'), null);
});

test('a later note for the same holding replaces the row', () => {
  const rows = knownRows();
  rows.note(1, 'row-a', 'user-1');
  rows.note(1, 'row-b', 'user-2');
  assert.equal(rows.rowFor(1, 'user-1'), null);
  assert.equal(rows.rowFor(1, 'user-2'), 'row-b');
});

test('notes nothing without a row or an account', () => {
  const rows = knownRows();
  rows.note(1, undefined, 'user-1');
  rows.note(2, 'row-a', null);
  rows.note(undefined, 'row-b', 'user-1');
  assert.equal(rows.rowFor(1, 'user-1'), null);
  assert.equal(rows.rowFor(2, 'user-1'), null);
});

test('forget and clear drop rows', () => {
  const rows = knownRows();
  rows.note(1, 'row-a', 'user-1');
  rows.note(2, 'row-b', 'user-1');
  rows.forget(1);
  assert.equal(rows.rowFor(1, 'user-1'), null);
  assert.equal(rows.rowFor(2, 'user-1'), 'row-b');
  rows.clear();
  assert.equal(rows.rowFor(2, 'user-1'), null);
});

test('every successful add notes its row', () => {
  const adds = appSource.match(/await addHolding\(/g) || [];
  const notes = appSource.match(/knownRowsRef\.current\.note\([^,]+, data\?\.id, userId\)/g) || [];
  assert.ok(adds.length >= 5, `found ${adds.length} adds`);
  assert.equal(notes.length, adds.length);
});

test('an edit and a delete with no row use the known row before a lookup', () => {
  assert.match(appSource, /const knownRow = knownRowsRef\.current\.rowFor\(item\.id, userId\);\n\s+const existingHolding = knownRow \? \{ id: knownRow \} : await findHoldingByLocalId\(/);
  // The list delete's, in sendListDelete, is tested there by behaviour
  assert.match(appSource, /knownRow: \(\) => knownRowsRef\.current\.rowFor\(id, supabaseUser\.id\),/);
});
