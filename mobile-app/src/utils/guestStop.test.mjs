// Run with: node --test mobile-app/src/utils/guestStop.test.mjs
// A guest who taps Stop gets the question back in the box, and the chat
// doesn't keep a question Troy never answered. The check reads the source,
// since App.js isn't under test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../../App.js', import.meta.url), 'utf8');

test('a stopped guest question comes off the chat and goes back in the box', () => {
  const start = app.indexOf('const sendGuestTroyMessage = async');
  assert.ok(start > 0);
  const body = app.slice(start, app.indexOf('result.kind === \'limit\'', start));
  const abort = body.slice(body.indexOf("e.name === 'AbortError'"));
  const branch = abort.slice(0, abort.indexOf('return;'));
  assert.match(branch, /giveBack\(\)/);
  // The stale reply guard still runs first, so a new chat isn't touched.
  assert.ok(body.indexOf('troySessionRef.current !== session') < body.indexOf("e.name === 'AbortError'"));
});
