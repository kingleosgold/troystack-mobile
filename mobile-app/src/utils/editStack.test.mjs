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
    'setSilverItems(withoutGuestMark);',
    'setSilverItems(remoteSilver);',
    'if (backup.data.silverItems) setSilverItems(asRestoredBy(',
  ];
  for (const swap of swaps) assert.ok(before(swap, 'bumpStackGen();', 80), swap);
  // The count only moves through the helper, which closes the detail view
  assert.equal((app.match(/stackGenRef\.current \+= 1;/g) || []).length, 1);
  const helper = app.slice(app.indexOf('const bumpStackGen = () => {'));
  assert.match(helper.slice(0, 200), /stackGenRef\.current \+= 1;\s*setShowDetailView\(false\);\s*setDetailItem\(null\);/);
});

test('delete refuses a holding from a stack that is gone, at the tap and at the confirm', () => {
  const del = app.slice(app.indexOf('const deleteItem = (id, metal) => {'));
  const tap = del.indexOf('if (stale()) {');
  const confirm = del.indexOf('if (opened.gen !== stackGenRef.current) {');
  assert.ok(tap >= 0 && tap < del.indexOf("Alert.alert(\n      'Delete Item'"));
  assert.ok(confirm > tap && confirm < del.indexOf('setter(prev => prev.filter(i => i.id !== id));'));
  assert.match(del.slice(0, 900), /opened\.userId !== \(supabaseUser\?\.id \|\| null\)/);
});

test('an edit counts from when the detail view it opened from was opened', () => {
  const view = app.slice(app.indexOf('const viewItemDetail = (item, metal) => {'), app.indexOf('const sortItems = '));
  const taken = view.indexOf("detailOpenedRef.current = { gen: stackGenRef.current, userId: supabaseUser?.id || null };");
  assert.ok(taken >= 0 && taken < view.indexOf('setDetailItem(item);'));
  const edit = app.slice(app.indexOf('const editItem = async (item, metal) => {'));
  const kept = edit.indexOf('editOpenedRef.current = detailOpenedRef.current;');
  assert.ok(kept >= 0 && kept < edit.indexOf('setEditingItem(item);'));
  // The edit button is the detail view's, with the detail view's copy
  assert.match(app, /editItem\(detailItem, detailMetal\);/);
  assert.equal((app.match(/editItem\(/g) || []).length, 1);
});

test('a save during a sync closes the sheet rather than ask for a save that cannot land', () => {
  const at = app.indexOf('if (editingItem && isSyncing) {');
  assert.ok(at >= 0);
  assert.match(app.slice(at, at + 200), /resetForm\(\);\s*setShowAddModal\(false\);/);
});

test('save drops an edit made across a swap or an account change', () => {
  const at = app.indexOf('const opened = editOpenedRef.current;');
  assert.ok(at >= 0);
  const check = app.slice(at, at + 600);
  assert.match(check, /opened\.gen !== stackGenRef\.current/);
  assert.match(check, /opened\.userId !== \(supabaseUser\?\.id \|\| null\)/);
  assert.match(check, /!opened/);
  assert.match(check, /resetForm\(\);\s*setShowAddModal\(false\);/);
  // It runs before the edit touches state or the cloud
  assert.ok(at < app.indexOf('const targetMetal = metalTab ===', at));
});
