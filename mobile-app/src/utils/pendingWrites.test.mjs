// Run with: node --test mobile-app/src/utils/pendingWrites.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pendingWrites } from './pendingWrites.js';

const gate = () => {
  let open;
  const shut = new Promise((resolve) => { open = resolve; });
  return { shut, open };
};

test('settles at once with nothing in flight', async () => {
  const writes = pendingWrites();
  await writes.settled();
  assert.equal(writes.size, 0);
});

test('waits for a write in flight and passes its result through', async () => {
  const writes = pendingWrites();
  const g = gate();
  const write = writes.track(async () => { await g.shut; return 'row'; });
  let settled = false;
  const waited = writes.settled().then(() => { settled = true; });
  await new Promise((r) => setImmediate(r));
  assert.equal(settled, false);
  assert.equal(writes.size, 1);
  g.open();
  await waited;
  assert.equal(await write, 'row');
  assert.equal(writes.size, 0);
});

test('a failed write still rejects to its caller and stops being waited for', async () => {
  const writes = pendingWrites();
  const write = writes.track(async () => { throw new Error('offline'); });
  await assert.rejects(write, /offline/);
  await writes.settled();
  assert.equal(writes.size, 0);
});

test('a write that throws before its first wait is held the same way', async () => {
  const writes = pendingWrites();
  const write = writes.track(() => { throw new Error('bad item'); });
  await assert.rejects(write, /bad item/);
  await writes.settled();
});

test('waits for every write, not just the first to settle', async () => {
  const writes = pendingWrites();
  const a = gate();
  const b = gate();
  writes.track(() => a.shut);
  writes.track(() => b.shut);
  let settled = false;
  const waited = writes.settled().then(() => { settled = true; });
  a.open();
  await new Promise((r) => setImmediate(r));
  assert.equal(settled, false);
  b.open();
  await waited;
});

const app = readFileSync(new URL('../../App.js', import.meta.url), 'utf8');

test('every holdings write to the cloud goes through the tracker', () => {
  const calls = [...app.matchAll(/await (addHolding|updateHolding|deleteHoldingFromSupabase)\(/g)];
  assert.equal(calls.length, 9);
  for (const call of calls) {
    const opener = app.lastIndexOf('async () => {', call.index);
    assert.equal(app.slice(opener - 'trackHoldingWrite('.length, opener), 'trackHoldingWrite(', `${call[1]} at ${call.index} is outside trackHoldingWrite`);
  }
});

test('the sync closes the gates before its first wait and waits for writes before it reads', () => {
  const start = app.indexOf('const syncHoldingsWithSupabase = async');
  const body = app.slice(start, app.indexOf('const { silverItems: remoteSilver', start));
  const flag = body.indexOf('isSyncingRef.current = true');
  assert.ok(flag > 0, 'the sync sets isSyncingRef itself');
  assert.ok(flag < body.indexOf('await '), 'before its first wait');
  assert.ok(body.indexOf('holdingWrites.settled()') > flag, 'the sync waits for writes in flight');
});

test('the sync reads the stack as committed after its waits, not as its render saw it', () => {
  const start = app.indexOf('const syncHoldingsWithSupabase = async');
  const body = app.slice(start, app.indexOf('const { silverItems: remoteSilver', start));
  const read = body.indexOf('= committedStackRef.current\n');
  assert.ok(read > body.indexOf('holdingWrites.settled()'), 'after the wait for writes in flight');
  assert.ok(read > body.indexOf('AsyncStorage.getAllKeys()'), 'after the storage reads');
  assert.ok(read < body.indexOf('const toUpload ='), 'before it picks what goes up');
  // with the retry marks of adds that failed put back, since a mark set by a
  // write it waited for may not be committed yet
  assert.ok(body.indexOf('withRetryMarks(items, retryMarksRef.current, supabaseUser.id)') > read, 'with the retry marks');
  // Neither the upload nor the claim's storage write reads the render's arrays
  assert.doesNotMatch(body, /\[silverItems, goldItems, platinumItems, palladiumItems\]/);
  assert.doesNotMatch(body, /\['stack_silver', silverItems\]/);
  // The ref follows every commit, whatever changed
  assert.match(app, /useLayoutEffect\(\(\) => \{\s*committedStackRef\.current = \[silverItems, goldItems, platinumItems, palladiumItems\];\s*\}\);/);
});
