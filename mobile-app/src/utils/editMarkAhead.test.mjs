// Run with: node --test mobile-app/src/utils/editMarkAhead.test.mjs
// A signed-in edit of a holding on its row is marked from the save, so an app
// killed while the update waits behind a resend or runs still sends the edit
// at the next sync rather than have the sync's swap undo it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { editMarkAhead, pendingEdits, withEditMarks, withoutSentEditMark } from './holdingsUpload.js';

const app = readFileSync(new URL('../../App.js', import.meta.url), 'utf8');

test("an edit of this account's row is marked for the account", () => {
  assert.deepEqual(editMarkAhead({ id: 1, supabase_id: 'r1' }, 'a'), { editPendingFor: 'a' });
});

test("a guest's, a restored or a rowless holding takes no mark, nor one with no account", () => {
  assert.deepEqual(editMarkAhead({ id: 1, supabase_id: 'r1', addedAsGuest: true }, 'a'), {});
  assert.deepEqual(editMarkAhead({ id: 1, supabase_id: 'r1', restoredFor: 'a' }, 'a'), {});
  assert.deepEqual(editMarkAhead({ id: 1 }, 'a'), {});
  assert.deepEqual(editMarkAhead({ id: 1, supabase_id: 'r1' }, null), {});
  assert.deepEqual(editMarkAhead(null, 'a'), {});
});

test('a marked edit is one the next sync sends, and a failure adds nothing to it', () => {
  const edited = { id: 1, supabase_id: 'r1', ozt: 2, ...editMarkAhead({ id: 1, supabase_id: 'r1' }, 'a') };
  assert.deepEqual(pendingEdits([[edited], [], [], []], 'a'), [{ item: edited, metal: 'silver' }]);
  const list = [edited];
  assert.equal(withEditMarks(list, new Map([[1, { rowId: 'r1', userId: 'a' }]]), 'a'), list);
});

test('the mark comes off only the copy whose update landed', () => {
  const sent = { id: 1, supabase_id: 'r1', editPendingFor: 'a' };
  const other = { id: 2, supabase_id: 'r2', editPendingFor: 'a' };
  assert.deepEqual(withoutSentEditMark([sent, other], sent), [{ id: 1, supabase_id: 'r1' }, other]);
  // A newer edit of the same holding keeps its own mark
  const newer = { ...sent, ozt: 3 };
  const list = [newer, other];
  assert.equal(withoutSentEditMark(list, sent), list);
  assert.equal(withoutSentEditMark(list, null), list);
});

test('App.js marks the edit at the save and clears it when the update lands', () => {
  assert.match(app, /\.\.\.\(editsHolding \? editMarkAhead\(base, supabaseUser\?\.id\) : \{\}\),\s*\}, base \? !base\.addedAsGuest : !!supabaseUser\);/);
  const branch = app.slice(app.indexOf('const { error } = await updateAfterResend(item.supabase_id, targetMetal);'));
  assert.match(branch.slice(0, 400), /if \(error\) markFailedEdit\(item\.supabase_id\);\s*else \{\s*editMarksRef\.current\.delete\(item\.id\);\s*setter\(prev => withoutSentEditMark\(prev, item\)\);/);
});
