// Run with: node --test mobile-app/src/utils/editStack.test.mjs
// An edit sheet opened on one stack must not save onto another. A sync, a
// restore, a claim or a reset swaps the whole stack in, and two stacks can
// share a local id (asRestoredBy keeps ids), so the id alone can't tell.
// These read App.js's source, since App.js isn't under test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../../App.js', import.meta.url), 'utf8');

function before(marker, needle, span = 200) {
  const at = app.indexOf(marker);
  assert.ok(at >= 0, `${marker} not found`);
  return app.slice(Math.max(0, at - span), at).includes(needle);
}

test('every whole stack swap counts', () => {
  const swaps = [
    'setSilverItems([]);\n    setGoldItems([]);',
    'if (cloudData.silverItems) setSilverItems(asRestoredBy(',
    'if (backup.data.silverItems) setSilverItems(asRestoredBy(',
  ];
  for (const swap of swaps) assert.ok(before(swap, 'bumpStackGen();', 80), swap);
  // A sync's swaps count as the same stack only when it is: the claim of an
  // unowned or own stack, and the cloud's copy of one
  assert.ok(before('setSilverItems(unmark);', 'bumpStackGen(true);', 80));
  assert.ok(before('setSilverItems(remoteSilver);', 'bumpStackGen(mayUploadLocalStack(stackOwner, supabaseUser.id));', 80));
  assert.ok(before('bumpStackGen(true);', 'if (claimsStack) {', 250));
  assert.equal((app.match(/bumpStackGen\(true\)/g) || []).length, 1);
  // The count only moves through the helper, which closes the detail view,
  // and any swap not marked same-stack moves the foreign count with it
  assert.equal((app.match(/stackGenRef\.current \+= 1;/g) || []).length, 1);
  assert.equal((app.match(/foreignSwapGenRef\.current = /g) || []).length, 1);
  const helper = app.slice(app.indexOf('const bumpStackGen = (sameStack = false) => {'));
  assert.match(helper.slice(0, 300), /stackGenRef\.current \+= 1;\s*if \(!sameStack\) foreignSwapGenRef\.current = stackGenRef\.current;\s*setShowDetailView\(false\);\s*setDetailItem\(null\);/);
});

test('delete refuses a holding from a stack that is gone, at the tap and at the confirm', () => {
  const del = app.slice(app.indexOf('const deleteItem = (id, metal) => {'));
  const tap = del.indexOf('if (stale()) {');
  const confirm = del.indexOf('if (stale()) {', tap + 1);
  assert.ok(tap >= 0 && tap < del.indexOf("Alert.alert(\n      'Delete Item'"));
  assert.ok(confirm > tap && confirm < del.indexOf('setter(prev => prev.filter(i => i.id !== id));'));
  // The confirm reads the account as of now, not as of the tap's render
  assert.match(del.slice(0, 1200), /opened\.userId !== userIdRef\.current/);
  assert.match(app, /userIdRef\.current = supabaseUser\?\.id \|\| null;/);
});

test('a delete waits for a running sync, at the tap and at the confirm', () => {
  const del = app.slice(app.indexOf('const deleteItem = (id, metal) => {'));
  const removed = del.indexOf('setter(prev => prev.filter(i => i.id !== id));');
  const tap = del.indexOf('if (syncing()) return;');
  const confirm = del.indexOf('if (syncing()) return;', tap + 1);
  assert.ok(tap >= 0 && tap < del.indexOf("Alert.alert(\n      'Delete Item'"));
  assert.ok(confirm > tap && confirm < removed);
  assert.match(del.slice(0, 1600), /if \(!userIdRef\.current \|\| !isSyncingRef\.current\) return false;/);
  // Only the sync sets the ref, so no render can set it back mid sync
  assert.doesNotMatch(app, /isSyncingRef\.current = isSyncing;/);
  assert.equal((app.match(/isSyncingRef\.current = (true|false);/g) || []).length, 2);
});

test('every add waits for a running sync, with nothing cleared', () => {
  const at = app.indexOf('const addWaitsForSync = () => {');
  assert.ok(at >= 0);
  const helper = app.slice(at, app.indexOf('return true;', at));
  assert.match(helper, /if \(!supabaseUser \|\| !isSyncingRef\.current\) return false;/);
  assert.doesNotMatch(helper, /resetForm\(\)|setShowAddModal\(false\)/);
  // Each add path checks it first, before it touches state or the cloud
  for (const start of ['const confirmImport = () => {', 'const confirmScannedItems = () => {', 'const addScannedItemIndividually = (index) => {']) {
    const fn = app.indexOf(start);
    assert.ok(fn >= 0, start);
    assert.match(app.slice(fn, fn + 120), /\n    if \(addWaitsForSync\(\)\) return;\n/, start);
  }
  // Save waits for it too, for an add or an edit
  const save = app.indexOf('    if (addWaitsForSync()) return;\n    // A restore, a reset');
  assert.ok(save >= 0 && save < app.indexOf('const targetMetal = metalTab ===', save));
});

test('an edit counts from when the detail view it opened from was opened', () => {
  const view = app.slice(app.indexOf('const viewItemDetail = (item, metal) => {'), app.indexOf('const sortItems = '));
  const taken = view.indexOf("detailOpenedRef.current = { gen: stackGenRef.current, userId: supabaseUser?.id || null };");
  assert.ok(taken >= 0 && taken < view.indexOf('setDetailItem(item);'));
  const edit = app.slice(app.indexOf('const editItem = async (item, metal) => {'));
  const kept = edit.indexOf('editOpenedRef.current = detailOpenedRef.current && { ...detailOpenedRef.current, metal };');
  assert.ok(kept >= 0 && kept < edit.indexOf('setEditingItem(item);'));
  // The edit button is the detail view's, with the detail view's copy
  assert.match(app, /editItem\(detailItem, detailMetal\);/);
  assert.equal((app.match(/editItem\(/g) || []).length, 1);
});

test('a save during a sync keeps the sheet open with what was typed', () => {
  assert.equal(app.indexOf('if (editingItem && isSyncingRef.current) {'), -1);
  const fn = app.slice(app.indexOf('const savePurchase = () => {'));
  const gate = fn.indexOf('if (addWaitsForSync()) return;');
  // Nothing before the gate clears the form or closes the sheet for a holding
  const head = fn.slice(fn.indexOf('// Normal add/edit flow for holdings'), gate);
  assert.ok(gate >= 0);
  assert.doesNotMatch(head, /resetForm\(\)|setShowAddModal\(false\)/);
});

test('an edit saves onto the copy of the holding in the stack now', () => {
  const fn = app.slice(app.indexOf('const savePurchase = () => {'));
  const now = fn.indexOf('const holdingNow = editsHolding ? holdingInStack(openedMetalItems, editingItem) : null;');
  assert.ok(now >= 0 && now < fn.indexOf('const item = asAddedBy({'));
  // The list of the metal it opened in, not the one the sheet picks now, and
  // the sheet's own copy unless a swap came
  assert.match(fn, /\[editOpenedRef\.current\?\.metal\];/);
  assert.match(fn, /const base = \(swappedSinceOpen && holdingNow\) \|\| editingItem;/);
  // The local id and the local update follow that copy too
  assert.match(fn, /id: base\?\.id \|\| Date\.now\(\),/);
  assert.match(fn, /const isBase = i => \(base\.supabase_id \? i\.supabase_id === base\.supabase_id : i\.id === base\.id\);/);
  assert.match(fn, /setter\(prev => prev\.map\(i => isBase\(i\) \? item : i\)\);/);
  // Its marks and row come from that copy, not from the sheet's opening
  // the copy keeps the holding's cloud row, so a later edit updates that row
  // and one that fails takes an edit mark rather than a lookup
  assert.match(fn, /\.\.\.\(\(base\?\.supabase_id && !base\.addedAsGuest\) \|\| base\?\.restoredFor \? \{ supabase_id: base\.supabase_id \} : \{\}\),\n\s*\.\.\.\(base\?\.restoredFor \? \{ restoredFor: base\.restoredFor \} : \{\}\),\n(\s*\/\/.*\n)*\s*\.\.\.\(base\?\.restoredFor && base\.rowLookupFor \? \{ rowLookupFor: base\.rowLookupFor \} : \{\}\),\n    \}, base \? !base\.addedAsGuest : !!supabaseUser\);/);
  assert.match(fn, /if \(editingItem && item\.supabase_id\) \{\n(\s*\/\/.*\n)*\s*const \{ error \} = await updateAfterResend\(item\.supabase_id, targetMetal\);/);
  // Scanned and imported items aren't holdings in the stack
  assert.match(fn, /const editsHolding = !!editingItem && editingItem\.scannedIndex === undefined && editingItem\.importIndex === undefined;/);
});

test('save drops an edit made across a swap or an account change', () => {
  const at = app.indexOf('const opened = editOpenedRef.current;');
  assert.ok(at >= 0);
  const check = app.slice(at, at + 600);
  assert.match(check, /if \(editingItem && \(!holdingNow \|\| !editOutlivesSwaps\(opened, \{\s*gen: stackGenRef\.current,\s*foreignGen: foreignSwapGenRef\.current,\s*userId: supabaseUser\?\.id,\s*\}\)\)\) \{/);
  assert.match(check, /resetForm\(\);\s*setShowAddModal\(false\);/);
  // It runs before the edit touches state or the cloud
  assert.ok(at < app.indexOf('const targetMetal = metalTab ===', at));
});

test('every signed-in add whose cloud write fails leaves its holding marked for the next sync', () => {
  // addHolding returns its error rather than throwing, so each call reads it
  const adds = [...app.matchAll(/await addHolding\(/g)].map((m) => m.index);
  assert.equal(adds.length, 5);
  for (const at of adds) {
    const line = app.slice(app.lastIndexOf('\n', at), app.indexOf('\n', at));
    assert.match(line, /const \{ (data, )?error \} = await addHolding\(/);
    assert.match(app.slice(at, at + 200), /if \(error\) markForRetry\(/);
  }
  // A mark names the account the write began under, and lands even after a
  // session that ended mid-write, since that account signs back in to it
  assert.match(app, /const markForRetry = \(metal, localId, userId, stackGen, kind = 'add'\) => \{\s*if \(foreignSwapGenRef\.current !== stackGen\) return;\s*retryMarksRef\.current\.set\(localId, userId\);/);
  // A failed lookup or add in an edit marks the holding only when it's this
  // account's to take
  assert.match(app, /if \(addsRow\) markForRetry\(targetMetal, item\.id, userId, stackGen\);/);
  // and a reset drops the marks with the stack
  assert.ok(before('retryMarksRef.current.clear();', 'const resetAllState = (fullReset = true) => {', 120));
  // and a sync that clears the marks has just swapped in the cloud's copy
  assert.match(app, /setPalladiumItems\(remotePalladium\);\n(\s*\/\/.*\n)*\s*retryMarksRef\.current\.clear\(\);/);
});

test('every edit whose cloud update fails leaves its holding marked for the next sync', () => {
  const fn = app.slice(app.indexOf('const savePurchase = () => {'), app.indexOf('const resetForm = () => {'));
  // updateHolding returns its error rather than throwing, so each call reads it
  const updates = [...fn.matchAll(/await updateAfterResend\(/g)].map((m) => m.index);
  assert.equal(updates.length, 2);
  // the wrapper ends in the update itself, after any resend of the row
  assert.match(fn, /return updateHolding\(supabaseUser\.id, rowId, item, metal\);/);
  for (const at of updates) {
    const line = fn.slice(fn.lastIndexOf('\n', at), fn.indexOf('\n', at));
    assert.match(line, /const \{ error \} = await updateAfterResend\((\w+(\.\w+)?), targetMetal\);/);
    const row = line.match(/updateAfterResend\((\w+(?:\.\w+)?),/)[1];
    // the mark names the row the update was for, and one that lands drops an older mark
    assert.ok(fn.slice(at, at + 260).includes(`if (error) markFailedEdit(${row});`), row);
    assert.ok(fn.slice(at, at + 260).includes('editMarksRef.current.delete(item.id);'), row);
  }
  // one restored or retried for this account takes the lookup mark, since a
  // sync never sends an edit mark on a holding still marked to go up
  assert.match(fn, /const markFailedEdit = \(rowId\) => \(item\.restoredFor === userId\n\s*\? markRowLookupForRetry\(targetMetal, item\.id, userId, stackGen\)\n\s*: markEditForRetry\(targetMetal, item\.id, rowId, userId, stackGen\)\);/);
  assert.match(app, /const markEditForRetry = \(metal, localId, rowId, userId, stackGen\) => \{\s*(\/\/.*\n\s*)*if \(foreignSwapGenRef\.current !== stackGen\) return;\s*const mark = \{ rowId, userId \};\s*editMarksRef\.current\.set\(localId, mark\);/);
  // a reset drops the marks with the stack, and so does a sync's swap
  const reset = app.slice(app.indexOf('const resetAllState = (fullReset = true) => {'));
  assert.ok(reset.indexOf('editMarksRef.current.clear();') < reset.indexOf('bumpStackGen(true)'));
  assert.ok(reset.indexOf('editMarksRef.current.clear();') < reset.indexOf('if (fullReset)'));
  assert.match(app, /setPalladiumItems\(remotePalladium\);\n(\s*\/\/.*\n)*\s*retryMarksRef\.current\.clear\(\);\n\s*editMarksRef\.current\.clear\(\);/);
});

test('a sync sends the marked edits before it fetches the cloud copy, and puts back any that fail', () => {
  const start = app.indexOf('const syncHoldingsWithSupabase = async');
  const body = app.slice(start, app.indexOf('// A change away from a signed-in account stops', start));
  const read = body.indexOf('withEditMarks(items, editMarksRef.current, supabaseUser.id)');
  const send = body.indexOf('for (const edit of pendingEdits([localSilver, localGold, localPlatinum, localPalladium], supabaseUser.id))');
  const fetch = body.indexOf('await fullSync(');
  assert.ok(read > 0 && send > read && fetch > send);
  // each edit stops at an account change, and a failed one is kept
  assert.match(body, /const resend = trackHoldingWrite\(\(\) => updateHolding\(supabaseUser\.id, rowId, edit\.item, edit\.metal\)\);\n[\s\S]*?const sent = await settleWithin\(resend, resendsBy - Date\.now\(\), accountChanged\);\n\s*if \(accountChanged\(\)\) return false;\n\s*if \(sent\.late\) resendsLate = true;\n\s*if \(!sent\.value \|\| sent\.value\.error\) unsentEdits\.push\(edit\);/);
  // after one resend runs late the rest stay marked for the next sync
  assert.match(body, /const resendsBy = Date\.now\(\) \+ HOLDING_WRITES_WAIT_MS;/);
  assert.match(body, /if \(resendsLate \|\| Date\.now\(\) >= resendsBy\) \{\n\s*unsentEdits\.push\(edit\);\n\s*continue;\n\s*\}/);
  // the swap and its stored copy carry the edits put back
  const merge = body.indexOf('withPendingEdits([cloudSilver, cloudGold, cloudPlatinum, cloudPalladium], unsentEdits)');
  assert.ok(merge > fetch && merge < body.indexOf('setSilverItems(remoteSilver);'));
  assert.match(body, /const stackWrites = refusedCount > 0 \|\| unsentEdits\.length > 0/);
});

test('a restore drops the write marks, so none lands on a restored copy', () => {
  for (const swap of ['if (cloudData.silverItems) setSilverItems(asRestoredBy(', 'if (backup.data.silverItems) setSilverItems(asRestoredBy(']) {
    const at = app.indexOf(swap);
    const lead = app.slice(at - 400, at);
    assert.ok(lead.includes('retryMarksRef.current.clear();') && lead.includes('editMarksRef.current.clear();'), swap);
  }
});

test("a sync with edits put back doesn't write storage over a restore that landed", () => {
  assert.match(app, /if \(\(refusedCount > 0 \|\| unsentEdits\.length > 0\) && restoreLanded\(\)\) return false;/);
  const guard = app.indexOf('(refusedCount > 0 || unsentEdits.length > 0) && restoreLanded()');
  assert.ok(guard < app.indexOf('const stackWrites = refusedCount > 0 || unsentEdits.length > 0'));
  // and a late failure marks the stack in state only for its own account
  assert.match(app, /editMarksRef\.current\.set\(localId, mark\);\n(\s*\/\/.*\n)*\s*if \(userIdRef\.current !== userId\) return;/);
});

test("a guest's holding keeps no row through an edit, since a restored backup's row needn't be this account's", () => {
  const fn = app.slice(app.indexOf('const savePurchase = () => {'), app.indexOf('const resetForm = () => {'));
  assert.ok(fn.includes('(base?.supabase_id && !base.addedAsGuest) || base?.restoredFor'));
});

test('a write takes the stack count when it begins, so a failure after a reset, restore or foreign swap marks nothing', () => {
  const calls = [...app.matchAll(/mark(Edit|RowLookup)?ForRetry\([^()]*, userId, stackGen(, '\w+')?\);/g)];
  // markRowLookupForRetry passes its own stackGen on to markForRetry.
  // markFailedEdit's two marks are checked with the updates.
  assert.equal(calls.length, 8);
  const takes = [...app.matchAll(/const userId = supabaseUser\.id;\n.*\n\s*const stackGen = foreignSwapGenRef\.current;/g)];
  assert.equal(takes.length, 4);
});

test("an edit updates only the row the holding kept, so a guest's restored row goes down the lookup path", () => {
  const fn = app.slice(app.indexOf('const savePurchase = () => {'), app.indexOf('const resetForm = () => {'));
  assert.ok(fn.includes('if (editingItem && item.supabase_id) {'));
  assert.ok(fn.includes('await updateAfterResend(item.supabase_id, targetMetal);'));
  assert.ok(!fn.includes('if (editingItem && base.supabase_id) {'));
});

test('an edit that picks another metal moves the holding and looks its row up under the metal it opened in', () => {
  const fn = app.slice(app.indexOf('const savePurchase = () => {'), app.indexOf('const resetForm = () => {'));
  assert.ok(fn.includes('const openedMetal = editsHolding ? opened?.metal : null;'));
  assert.ok(fn.includes('settersMap[openedMetal](prev => prev.filter(i => !isBase(i)));'));
  assert.ok(fn.includes('setter(prev => [...prev.filter(i => !isBase(i)), item]);'));
  assert.ok(fn.includes('findHoldingByLocalId(supabaseUser.id, item.id, lookupMetal)'));
});

test("an edit with no row waits for the writes before it, so an add still in flight isn't looked up too early and added twice", () => {
  const fn = app.slice(app.indexOf('const savePurchase = () => {'), app.indexOf('const resetForm = () => {'));
  // Taken before the edit's own write is tracked, so it never waits on itself
  const taken = fn.indexOf('const earlierWrites = editingItem && !item.supabase_id');
  const tracked = fn.indexOf('trackHoldingWrite(async () => {');
  assert.ok(taken >= 0 && tracked > taken);
  assert.ok(fn.includes('holdingWrites.settled(HOLDING_WRITES_WAIT_MS, userId, () => userIdRef.current !== userId)'));
  // Awaited on the lookup path, before the lookup
  const lookup = fn.slice(fn.indexOf('} else if (editingItem) {'));
  assert.ok(lookup.indexOf('await earlierWrites;') >= 0);
  assert.ok(lookup.indexOf('await earlierWrites;') < lookup.indexOf('findHoldingByLocalId('));
});

test("an edit that waited doesn't add a row for a holding deleted on the phone meanwhile", () => {
  const fn = app.slice(app.indexOf('const savePurchase = () => {'), app.indexOf('const resetForm = () => {'));
  const lookup = fn.slice(fn.indexOf('} else if (editingItem) {'));
  const skip = lookup.indexOf('} else if (addsRow && !stillOnPhone(item.id)) {');
  const add = lookup.indexOf('} else if (addsRow) {');
  assert.ok(skip > 0 && skip < add);
  assert.match(lookup.slice(skip, add), /addsRow = false;/);
  assert.ok(fn.includes('return !lists || lists.some(list => (list || []).some(i => i.id === localId));'));
});

test('an edit of a row goes after a resend of it the sync let go of, or stays marked', () => {
  const start = app.indexOf('const syncHoldingsWithSupabase = async');
  const body = app.slice(start, app.indexOf('// A change away from a signed-in account stops', start));
  assert.ok(body.includes('rowResendsRef.current.set(rowId, resend);'));
  assert.ok(body.includes('const forget = () => { if (rowResendsRef.current.get(rowId) === resend) rowResendsRef.current.delete(rowId); };'));
  const fn = app.slice(app.indexOf('const savePurchase = () => {'), app.indexOf('const resetForm = () => {'));
  const helper = fn.slice(fn.indexOf('const updateAfterResend = async (rowId, metal) => {'));
  assert.match(helper.slice(0, 500), /const resend = rowResendsRef\.current\.get\(rowId\);\n\s*if \(resend\) \{\n\s*const settled = await settleWithin\(resend, HOLDING_WRITES_WAIT_MS, \(\) => userIdRef\.current !== userId\);\n\s*if \(settled\.late \|\| settled\.stopped\) return \{ error: /);
});
