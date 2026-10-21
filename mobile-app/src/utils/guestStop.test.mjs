// Run with: node --test mobile-app/src/utils/guestStop.test.mjs
// A guest who taps Stop gets no answer, so the question can't stay in the
// chat as if Troy had it. It comes off and goes back in the box, as when a
// send fails. These read App.js's source, since App.js isn't under test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../../App.js', import.meta.url), 'utf8');
const guest = app.slice(app.indexOf('const sendGuestTroyMessage = async (text, fromInput) => {'));

test('a stopped guest question comes off the chat and back to the box', () => {
  const abort = guest.indexOf("if (e.name === 'AbortError') {");
  assert.ok(abort >= 0);
  assert.match(guest.slice(abort, abort + 80), /giveBack\(\);\s*return;/);
});

test('giving a question back keeps anything typed since', () => {
  const at = guest.indexOf('const giveBack = () => {');
  assert.ok(at >= 0);
  const body = guest.slice(at, guest.indexOf('};', at));
  assert.match(body, /setTroyMessages\(prev => prev\.filter\(m => m\.id !== userMsg\.id\)\);/);
  assert.match(body, /setTroyInputText\(prev => prev \|\| text\);/);
  assert.match(body, /setTroyLoading\(false\);/);
});
