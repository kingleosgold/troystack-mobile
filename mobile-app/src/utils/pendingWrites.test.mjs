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

test('with a stop check it answers false as soon as the check turns true, well before the limit', async () => {
  const writes = pendingWrites();
  const g = gate();
  writes.track(() => g.shut);
  let left = false;
  setTimeout(() => { left = true; }, 10);
  const start = Date.now();
  assert.equal(await writes.settled(60000, undefined, () => left), false);
  assert.ok(Date.now() - start < 5000, 'it let go at the stop, not the limit');
  assert.equal(writes.size, 1, 'the hung write stays tracked');
  g.open();
});

test('with a stop check that never turns true it still answers true once the writes land', async () => {
  const writes = pendingWrites();
  const g = gate();
  writes.track(() => g.shut);
  const answer = writes.settled(60000, undefined, () => false);
  g.open();
  assert.equal(await answer, true);
});

test('the sync gives up with an error before it reads anything when the writes miss the limit', () => {
  const start = app.indexOf('const syncHoldingsWithSupabase = async');
  const body = app.slice(start, app.indexOf('const { silverItems: remoteSilver', start));
  const wait = body.indexOf('await holdingWrites.settled(HOLDING_WRITES_WAIT_MS, supabaseUser.id, accountChanged)');
  assert.ok(wait > 0, 'the sync waits with the limit');
  const late = body.indexOf('if (!writesLanded)', wait);
  assert.ok(late > wait, 'and checks the answer');
  assert.ok(body.indexOf('setSyncError(', late) > late, 'and sets syncError so the retry runs');
  assert.ok(body.indexOf('return false', late) > late);
  assert.ok(body.indexOf('AsyncStorage', late) > body.indexOf('return false', late), 'before it reads anything');
});

test('with an account it waits only for that account\'s writes', async () => {
  const writes = pendingWrites();
  const hung = gate();
  const mine = gate();
  writes.track(() => hung.shut, 'a');
  writes.track(() => mine.shut, 'b');
  let settled = false;
  const waited = writes.settled(1000, 'b').then((landed) => { settled = true; return landed; });
  await new Promise((r) => setImmediate(r));
  assert.equal(settled, false, 'it still waits for its own write');
  mine.open();
  assert.equal(await waited, true, 'and the other account\'s hung write does not hold it');
  assert.equal(writes.size, 1);
  assert.equal(await writes.settled(20, 'a'), false, 'the hung account still waits on its own');
  hung.open();
  assert.equal(await writes.settled(20), true);
});

test('without an account it waits for every account\'s writes', async () => {
  const writes = pendingWrites();
  const g = gate();
  writes.track(() => g.shut, 'a');
  assert.equal(await writes.settled(20), false);
  g.open();
  assert.equal(await writes.settled(20), true);
});

const app = readFileSync(new URL('../../App.js', import.meta.url), 'utf8');

test('the tracker keys each write by the signed in account', () => {
  assert.ok(app.includes('holdingWrites.track(run, supabaseUser?.id)'));
});

test('every holdings write to the cloud goes through the tracker', () => {
  // The sync's own sends of marked edits run with the gates closed, so they
  // aren't writes it has to wait for
  const sync = app.indexOf('const syncHoldingsWithSupabase = async');
  const syncEnd = app.indexOf('// A change away from a signed-in account stops', sync);
  const calls = [...app.matchAll(/await (addHolding|updateHolding|deleteHoldingFromSupabase)\(/g)]
    .filter((call) => call.index < sync || call.index > syncEnd);
  assert.equal(calls.length, 9);
  for (const call of calls) {
    const opener = app.lastIndexOf('async () => {', call.index);
    assert.equal(app.slice(opener - 'trackHoldingWrite('.length, opener), 'trackHoldingWrite(', `${call[1]} at ${call.index} is outside trackHoldingWrite`);
  }
});

test('every cloud update and delete is pinned to the account the tracker waits on', () => {
  const calls = [...app.matchAll(/await (updateHolding|deleteHoldingFromSupabase)\(([^,)]*)/g)];
  assert.equal(calls.length, 5);
  for (const call of calls) assert.equal(call[2], 'supabaseUser.id', `${call[1]} at ${call.index}`);
  const service = readFileSync(new URL('../services/supabaseHoldings.ts', import.meta.url), 'utf8');
  for (const name of ['updateHolding', 'deleteHolding']) {
    const at = service.indexOf(`export async function ${name}(`);
    const body = service.slice(at, service.indexOf('\n}\n', at));
    assert.match(body, /^export async function \w+\(\n\s*userId: string,\n\s*supabaseId: string/);
    assert.match(body, /\.eq\('id', supabaseId\)\n\s*\.eq\('user_id', userId\)/);
  }
});

test('a cloud update leaves a deleted row alone and the edit reads the miss', () => {
  const service = readFileSync(new URL('../services/supabaseHoldings.ts', import.meta.url), 'utf8');
  const at = service.indexOf('export async function updateHolding(');
  const body = service.slice(at, service.indexOf('\n}\n', at));
  assert.match(body, /\.eq\('user_id', userId\)\n(\s*\/\/.*\n)*\s*\.is\('deleted_at', null\)\n\s*\.select\(\)\n\s*\.single\(\);/);
  const calls = [...app.matchAll(/(.*)await updateHolding\(/g)];
  assert.equal(calls.length, 3);
  for (const call of calls) assert.match(call[1], /const \{ error(: \w+)? \} = $/, `updateHolding at ${call.index}`);
});

test('the sync closes the gates before its first wait and waits for writes before it reads', () => {
  const start = app.indexOf('const syncHoldingsWithSupabase = async');
  const body = app.slice(start, app.indexOf('const { silverItems: remoteSilver', start));
  const flag = body.indexOf('isSyncingRef.current = true');
  assert.ok(flag > 0, 'the sync sets isSyncingRef itself');
  assert.ok(flag < body.indexOf('await '), 'before its first wait');
  assert.ok(body.indexOf('holdingWrites.settled(HOLDING_WRITES_WAIT_MS, supabaseUser.id, accountChanged)') > flag, 'the sync waits for writes in flight');
});

test('the sync reads the stack as committed after its waits, not as its render saw it', () => {
  const start = app.indexOf('const syncHoldingsWithSupabase = async');
  const body = app.slice(start, app.indexOf('const { silverItems: remoteSilver', start));
  const read = body.indexOf('= committedStackRef.current\n');
  assert.ok(read > body.indexOf('holdingWrites.settled(HOLDING_WRITES_WAIT_MS, supabaseUser.id, accountChanged)'), 'after the wait for writes in flight');
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

test('a wait taken before a write is tracked settles without it, so that write can await it', async () => {
  const writes = pendingWrites();
  const add = gate();
  writes.track(async () => { await add.shut; });
  const earlier = writes.settled(1000);
  let editLooked = false;
  const edit = writes.track(async () => { await earlier; editLooked = true; });
  await new Promise((r) => setImmediate(r));
  assert.equal(editLooked, false);
  add.open();
  await edit;
  assert.equal(editLooked, true);
  assert.equal(await earlier, true);
});
