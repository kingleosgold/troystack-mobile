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
  assert.ok(before('setSilverItems(withoutGuestMark);', 'bumpStackGen(true);', 80));
  assert.ok(before('setSilverItems(remoteSilver);', 'bumpStackGen(mayUploadLocalStack(stackOwner, supabaseUser.id));', 80));
  assert.ok(before('bumpStackGen(true);', 'if (claimsStack) {', 40));
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
  assert.match(fn, /\.\.\.\(base\?\.restoredFor \? \{ restoredFor: base\.restoredFor, supabase_id: base\.supabase_id \} : \{\}\),\n    \}, base \? !base\.addedAsGuest : !!supabaseUser\);/);
  assert.match(fn, /if \(editingItem && base\.supabase_id\) \{\n\s*\/\/ Update existing item in Supabase\n\s*await updateHolding\(base\.supabase_id, item, targetMetal\);/);
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
  // A mark lands only for the account the write began under
  assert.match(app, /const markForRetry = \(metal, localId, userId, accountGen\) => \{\n    if \(accountGenRef\.current !== accountGen\) return;/);
  // and a sync that clears the marks has just swapped in the cloud's copy
  assert.match(app, /setPalladiumItems\(remotePalladium\);\n(\s*\/\/.*\n)*\s*retryMarksRef\.current\.clear\(\);/);
});
