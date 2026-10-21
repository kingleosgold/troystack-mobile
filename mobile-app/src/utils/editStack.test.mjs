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
  for (const swap of swaps) assert.ok(before(swap, 'stackGenRef.current += 1;', 80), swap);
});

test('the edit sheet keeps the count and account it opened on', () => {
  const at = app.indexOf("editOpenedRef.current = { gen: stackGenRef.current, userId: supabaseUser?.id || null };");
  assert.ok(at >= 0);
  assert.equal(app.slice(at, at + 200).match(/setEditingItem\(item\);/)?.index > 0, true);
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
