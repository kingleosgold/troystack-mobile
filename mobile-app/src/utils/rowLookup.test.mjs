// Run with: node --test mobile-app/src/utils/rowLookup.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { asRestoredBy, holdingsToUpload, localHoldingsToSync, rowEditsToSend, withRetryMarks, withRowLookups } from './holdingsUpload.js';

const appSource = readFileSync(new URL('../../App.js', import.meta.url), 'utf8');
const holdingsSource = readFileSync(new URL('../services/supabaseHoldings.ts', import.meta.url), 'utf8');

test('a lookup mark goes only on a holding with this account\'s retry mark', () => {
  const items = [
    { id: 1, restoredFor: 'a' },
    { id: 2, restoredFor: 'b' },
    { id: 3, restoredFor: 'a', supabase_id: 'r3' },
    { id: 4 },
    { id: 5, restoredFor: 'a' },
  ];
  const marks = new Map([[1, 'a'], [2, 'a'], [3, 'a'], [4, 'a']]);
  assert.deepEqual(withRowLookups(items, marks, 'a'), [
    { id: 1, restoredFor: 'a', rowLookupFor: 'a' },
    // a restored holding with a row is found by local id too
    items[1], { id: 3, restoredFor: 'a', supabase_id: 'r3', rowLookupFor: 'a' }, items[3], items[4],
  ]);
});

test('the same array comes back when nothing changes', () => {
  const items = [{ id: 1, restoredFor: 'a', rowLookupFor: 'a' }];
  assert.equal(withRowLookups(items, new Map([[1, 'a']]), 'a'), items);
  assert.equal(withRowLookups(items, new Map(), 'a'), items);
  assert.equal(withRowLookups(items, new Map([[1, 'a']]), null), items);
});

test('a marked edit goes over its live row, which the insert skips', () => {
  const edited = { id: 1, restoredFor: 'a', rowLookupFor: 'a' };
  const noRow = { id: 2, restoredFor: 'a', rowLookupFor: 'a' };
  const plainRetry = { id: 3, restoredFor: 'a' };
  const otherAccount = { id: 4, restoredFor: 'b', rowLookupFor: 'b' };
  const items = [edited, noRow, plainRetry, otherAccount];
  const liveRows = new Map([[1, 'r1'], [3, 'r3'], [4, 'r4']]);
  assert.deepEqual(rowEditsToSend(items, liveRows, 'a'), [{ item: edited, rowId: 'r1' }]);
  // the one with no row still goes up as an add
  assert.deepEqual(holdingsToUpload(items, new Set([1, 3, 4]), new Set()), [noRow]);
});

test('an edit of a row deleted elsewhere is not sent', () => {
  const edited = { id: 1, restoredFor: 'a', rowLookupFor: 'a' };
  // a deleted row is left out of the live rows, and its local id still stops the insert
  assert.deepEqual(rowEditsToSend([edited], new Map(), 'a'), []);
  assert.deepEqual(holdingsToUpload([edited], new Set([1]), new Set()), []);
});

test('a marked edit is among what a later sync sends', () => {
  const marked = withRowLookups(withRetryMarks([{ id: 1 }], new Map([[1, 'a']]), 'a'), new Map([[1, 'a']]), 'a');
  assert.deepEqual(localHoldingsToSync(marked, 'a', 'a', false), marked);
});

test('an edit whose lookup failed takes the lookup mark, and the sync reads the marks back', () => {
  assert.match(appSource, /await findHoldingByLocalId\(supabaseUser\.id, item\.id, lookupMetal\);\n\s+lookedUp = true;/);
  assert.match(appSource, /if \(addsRow && editingItem && !lookedUp\) markRowLookupForRetry\(targetMetal, item\.id, userId, stackGen\);\n\s+else if \(addsRow\) markForRetry\(/);
  assert.match(appSource, /\.map\(\(items\) => withRowLookups\(items, rowLookupMarksRef\.current, supabaseUser\.id\)\)/);
  // every place the retry marks clear, the lookup marks clear too
  const retryClears = appSource.match(/retryMarksRef\.current\.clear\(\);/g).length;
  const lookupClears = (appSource.match(/rowLookupMarksRef\.current\.clear\(\);/g) || []).length;
  assert.equal(lookupClears, retryClears);
});

test('the upload sends marked edits over their rows and a failed one takes its row\'s place', () => {
  assert.match(holdingsSource, /if \(!h\.deleted_at\) liveRows\.set\(notesData\.local_id, h\.id\);/);
  assert.match(holdingsSource, /rowEditsToSend\(items, liveRows, userId\)/);
  assert.match(holdingsSource, /track\(rowId, \(\) => updateHolding\(userId, rowId, item, metal\)\)/);
  assert.match(holdingsSource, /const unsentRows = unsentRowEdits\.map\(\(\{ item, rowId, metal \}\) => \(\{ item, metal, rowId \}\)\);/);
  // put back like a refusal, but never counted or named as one
  assert.match(holdingsSource, /const putBack = \[\.\.\.rejected, \.\.\.unsentRows\];/);
  assert.match(holdingsSource, /refusedCount: rejected\.length,/);
  assert.match(holdingsSource, /unsentRowEdits: unsentRows\.length,/);
  assert.match(appSource, /if \(!error\) unsent \+= unsentRowEdits \|\| 0;/);
  assert.match(holdingsSource, /silverItems: lists\.silver,/);
});

test("a restored backup's lookup mark comes off, so the backup's copy never goes over a row", () => {
  const backup = [{ id: 1, restoredFor: 'a', rowLookupFor: 'a' }];
  assert.deepEqual(asRestoredBy(backup, 'a'), [{ id: 1, restoredFor: 'a' }]);
  assert.deepEqual(asRestoredBy(backup, null), [{ id: 1, addedAsGuest: true }]);
  assert.deepEqual(rowEditsToSend(asRestoredBy(backup, 'a'), new Map([[1, 'r1']]), 'a'), []);
});

test('a later save keeps the lookup mark, and a failed send keeps it on the copy put back', () => {
  assert.match(appSource, /\.\.\.\(base\?\.restoredFor && base\.rowLookupFor \? \{ rowLookupFor: base\.rowLookupFor \} : \{\}\),/);
  assert.match(holdingsSource, /\.map\(\(back\) => \(rowId \? \{ \.\.\.back, supabase_id: rowId, rowLookupFor: userId \} : back\)\)/);
  // the notice says an edit didn't reach the account, not an add
  assert.match(appSource, /markForRetry\(metal, localId, userId, stackGen, 'edit'\);/);
});

test('a restored holding with a row whose update failed is sent over the row by local id', () => {
  const restored = withRowLookups([{ id: 5, restoredFor: 'a', supabase_id: 'r5' }], new Map([[5, 'a']]), 'a');
  assert.deepEqual(rowEditsToSend(restored, new Map([[5, 'r5']]), 'a'), [{ item: restored[0], rowId: 'r5' }]);
  // and never inserted again, since its row is the account's
  assert.deepEqual(holdingsToUpload(restored, new Set([5]), new Set(['r5'])), []);
});

test('a failed edit put back on its row goes over that row once and never as a new row', async () => {
  const { holdingsToUpload, rowEditsToSend: send } = await import('./holdingsUpload.js');
  const back = { id: 7, restoredFor: 'a', rowLookupFor: 'a', supabase_id: 'r7' };
  assert.deepEqual(holdingsToUpload([back], new Set([7]), new Set(['r7'])), []);
  assert.deepEqual(send([back], new Map([[7, 'r7']]), 'a'), [{ item: back, rowId: 'r7' }]);
});
