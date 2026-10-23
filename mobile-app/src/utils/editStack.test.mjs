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
  assert.match(fn, /setter\(prev => prev\.map\(i => \(base\.supabase_id \? i\.supabase_id === base\.supabase_id : i\.id === base\.id\) \? item : i\)\);/);
  // Its marks and row come from that copy, not from the sheet's opening
  // the copy keeps the holding's cloud row, so a later edit updates that row
  // and one that fails takes an edit mark rather than a lookup
  assert.match(fn, /\.\.\.\(base\?\.supabase_id \? \{ supabase_id: base\.supabase_id \} : \{\}\),\n\s*\.\.\.\(base\?\.restoredFor \? \{ restoredFor: base\.restoredFor \} : \{\}\),\n    \}, base \? !base\.addedAsGuest : !!supabaseUser\);/);
  assert.match(fn, /if \(editingItem && base\.supabase_id\) \{\n\s*\/\/ Update existing item in Supabase\n\s*const \{ error \} = await updateHolding\(supabaseUser\.id, base\.supabase_id, item, targetMetal\);/);
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
  assert.match(app, /const markForRetry = \(metal, localId, userId\) => \{\s*retryMarksRef\.current\.set\(localId, userId\);/);
  // A failed lookup or add in an edit marks the holding only when it's this
  // account's to take
  assert.match(app, /if \(addsRow\) markForRetry\(targetMetal, item\.id, userId\);/);
  // and a reset drops the marks with the stack
  assert.ok(before('retryMarksRef.current.clear();', 'const resetAllState = (fullReset = true) => {', 120));
  // and a sync that clears the marks has just swapped in the cloud's copy
  assert.match(app, /setPalladiumItems\(remotePalladium\);\n(\s*\/\/.*\n)*\s*retryMarksRef\.current\.clear\(\);/);
});

test('every edit whose cloud update fails leaves its holding marked for the next sync', () => {
  const fn = app.slice(app.indexOf('const savePurchase = () => {'), app.indexOf('const resetForm = () => {'));
  // updateHolding returns its error rather than throwing, so each call reads it
  const updates = [...fn.matchAll(/await updateHolding\(/g)].map((m) => m.index);
  assert.equal(updates.length, 2);
  for (const at of updates) {
    const line = fn.slice(fn.lastIndexOf('\n', at), fn.indexOf('\n', at));
    assert.match(line, /const \{ error \} = await updateHolding\(supabaseUser\.id, (\w+(\.\w+)?), item, targetMetal\);/);
    const row = line.match(/updateHolding\(supabaseUser\.id, (\w+(?:\.\w+)?),/)[1];
    // the mark names the row the update was for, and one that lands drops an older mark
    assert.ok(fn.slice(at, at + 260).includes(`if (error) markEditForRetry(targetMetal, item.id, ${row}, userId);`), row);
    assert.ok(fn.slice(at, at + 260).includes('editMarksRef.current.delete(item.id);'), row);
  }
  assert.match(app, /const markEditForRetry = \(metal, localId, rowId, userId\) => \{\s*const mark = \{ rowId, userId \};\s*editMarksRef\.current\.set\(localId, mark\);/);
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
  assert.match(body, /await updateHolding\(supabaseUser\.id, edit\.item\.supabase_id, edit\.item, edit\.metal\);\n\s*if \(accountChanged\(\)\) return false;\n\s*if \(editError\) unsentEdits\.push\(edit\);/);
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

test('a failed add that lands after its account left marks nothing on the stack now on the phone', () => {
  const fn = app.slice(app.indexOf('const markForRetry = (metal, localId, userId) => {'), app.indexOf('const markEditForRetry ='));
  const guard = fn.indexOf('if (userIdRef.current !== userId) return;');
  assert.ok(guard > fn.indexOf('retryMarksRef.current.set(localId, userId);'), 'the ref keeps the mark for its own account');
  assert.ok(guard < fn.indexOf('withRetryMarks('), 'before the stack is touched');
});
