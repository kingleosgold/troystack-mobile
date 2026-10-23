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

test('with a limit it answers true once the writes land in time', async () => {
  const writes = pendingWrites();
  const g = gate();
  writes.track(() => g.shut);
  const waited = writes.settled(1000);
  g.open();
  assert.equal(await waited, true);
});

test('with a limit it answers false when a write hangs past it, and the write stays tracked', async () => {
  const writes = pendingWrites();
  const g = gate();
  const write = writes.track(() => g.shut);
  assert.equal(await writes.settled(20), false);
  assert.equal(writes.size, 1);
  g.open();
  await write;
  assert.equal(await writes.settled(20), true);
  assert.equal(writes.size, 0);
});

test('with a limit and nothing in flight it answers true at once', async () => {
  assert.equal(await pendingWrites().settled(20), true);
});

test('the sync gives up with an error before it reads anything when the writes miss the limit', () => {
  const start = app.indexOf('const syncHoldingsWithSupabase = async');
  const body = app.slice(start, app.indexOf('const { silverItems: remoteSilver', start));
  const wait = body.indexOf('await holdingWrites.settled(HOLDING_WRITES_WAIT_MS)');
  assert.ok(wait > 0, 'the sync waits with the limit');
  const late = body.indexOf('if (!writesLanded)', wait);
  assert.ok(late > wait, 'and checks the answer');
  assert.ok(body.indexOf('setSyncError(', late) > late, 'and sets syncError so the retry runs');
  assert.ok(body.indexOf('return false', late) > late);
  assert.ok(body.indexOf('AsyncStorage', late) > body.indexOf('return false', late), 'before it reads anything');
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
  assert.ok(body.indexOf('holdingWrites.settled(HOLDING_WRITES_WAIT_MS)') > flag, 'the sync waits for writes in flight');
});

test('the sync reads the stack as committed after its waits, not as its render saw it', () => {
  const start = app.indexOf('const syncHoldingsWithSupabase = async');
  const body = app.slice(start, app.indexOf('const { silverItems: remoteSilver', start));
  const read = body.indexOf('= committedStackRef.current;');
  assert.ok(read > body.indexOf('holdingWrites.settled(HOLDING_WRITES_WAIT_MS)'), 'after the wait for writes in flight');
  assert.ok(read > body.indexOf('AsyncStorage.getAllKeys()'), 'after the storage reads');
  assert.ok(read < body.indexOf('const toUpload ='), 'before it picks what goes up');
  // Neither the upload nor the claim's storage write reads the render's arrays
  assert.doesNotMatch(body, /\[silverItems, goldItems, platinumItems, palladiumItems\]/);
  assert.doesNotMatch(body, /\['stack_silver', silverItems\]/);
  // The ref follows every commit, whatever changed
  assert.match(app, /useLayoutEffect\(\(\) => \{\s*committedStackRef\.current = \[silverItems, goldItems, platinumItems, palladiumItems\];\s*\}\);/);
});
