// Run with: node --test mobile-app/src/utils/pendingWrites.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pendingWrites, sendAllWithin, settleWithin } from './pendingWrites.js';

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
  const calls = [...app.matchAll(/await (addHolding|updateHolding|updateAfterResend|deleteHoldingFromSupabase)\(/g)]
    .filter((call) => call.index < sync || call.index > syncEnd);
  assert.equal(calls.length, 9);
  for (const call of calls) {
    const opener = app.lastIndexOf('async () => {', call.index);
    assert.equal(app.slice(opener - 'trackHoldingWrite('.length, opener), 'trackHoldingWrite(', `${call[1]} at ${call.index} is outside trackHoldingWrite`);
  }
});

test('every cloud update and delete is pinned to the account the tracker waits on', () => {
  const calls = [...app.matchAll(/(?:await |=> |return )(updateHolding|deleteHoldingFromSupabase)\(([^,)]*)/g)];
  assert.equal(calls.length, 4);
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
  const calls = [...app.matchAll(/(.*)await updateAfterResend\(/g)];
  assert.equal(calls.length, 2);
  for (const call of calls) assert.match(call[1], /const \{ error(: \w+)? \} = $/, `updateAfterResend at ${call.index}`);
  // the sync's resend reads the miss from the settled result
  assert.ok(app.includes('if (!sent.value || sent.value.error) unsentEdits.push(edit);'));
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

test('settleWithin passes a write through, and answers late or stopped without aborting a stalled one', async () => {
  assert.deepEqual(await settleWithin(Promise.resolve({ error: null }), 1000), { value: { error: null } });
  const boom = new Error('offline');
  assert.deepEqual(await settleWithin(Promise.reject(boom), 1000), { error: boom });
  const stalled = gate();
  let landed = false;
  const write = stalled.shut.then(() => { landed = true; });
  assert.deepEqual(await settleWithin(write, 20), { late: true });
  let stop = false;
  setTimeout(() => { stop = true; }, 10);
  const start = Date.now();
  assert.deepEqual(await settleWithin(write, 5000, () => stop), { stopped: true });
  assert.ok(Date.now() - start < 2000);
  stalled.open();
  await write;
  assert.equal(landed, true);
});

test('the sync resends each marked edit as a tracked write, bounded by the write wait', () => {
  const start = app.indexOf('const syncHoldingsWithSupabase = async');
  const body = app.slice(start, app.indexOf('// A change away from a signed-in account stops', start));
  assert.ok(body.includes('trackRowResend(rowId, () => updateHolding(supabaseUser.id, rowId, edit.item, edit.metal))'));
  assert.ok(body.includes('const resend = trackHoldingWrite(run);'));
  // fullSync's resends over rows found by local id share the limit
  assert.ok(body.includes('{ track: trackRowResend, by: resendsBy, stopped: accountChanged }'));
  assert.ok(!/await updateHolding\(supabaseUser\.id, edit\.item/.test(body));
});

test('countFor counts only that account\'s unsettled writes', async () => {
  const w = pendingWrites();
  let done;
  w.track(() => new Promise((r) => { done = r; }), 'u1');
  w.track(() => new Promise(() => {}), 'u2');
  assert.equal(w.countFor('u1'), 1);
  assert.equal(w.countFor('u3'), 0);
  await Promise.resolve();
  done();
  await w.settled(0, 'u1');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(w.countFor('u1'), 0);
});

test('sendAllWithin keeps the jobs that fail, hang past the deadline or come after it', async () => {
  const sent = [];
  const send = (job) => {
    sent.push(job);
    if (job === 'hang') return new Promise(() => {});
    if (job === 'bad') return Promise.resolve({ error: new Error('no') });
    if (job === 'throw') return Promise.reject(new Error('no'));
    return Promise.resolve({ error: null });
  };
  const unsent = await sendAllWithin(['ok', 'bad', 'throw', 'hang', 'after'], send, Date.now() + 60);
  assert.deepEqual(unsent, ['bad', 'throw', 'hang', 'after']);
  // the job after the hung one never starts
  assert.deepEqual(sent, ['ok', 'bad', 'throw', 'hang']);
});

test('sendAllWithin starts nothing once the account changed or the deadline passed', async () => {
  let started = 0;
  const send = () => { started += 1; return Promise.resolve({ error: null }); };
  assert.deepEqual(await sendAllWithin(['a', 'b'], send, Date.now() + 1000, () => true), ['a', 'b']);
  assert.deepEqual(await sendAllWithin(['a'], send, Date.now() - 1), ['a']);
  assert.equal(started, 0);
});

test('sendAllWithin lets go of a write when the account changes during it', async () => {
  let changed = false;
  const started = [];
  const send = (job) => {
    started.push(job);
    setTimeout(() => { changed = true; }, 10);
    return new Promise(() => {});
  };
  const unsent = await sendAllWithin(['a', 'b'], send, Date.now() + 5000, () => changed);
  assert.deepEqual(unsent, ['a', 'b']);
  assert.deepEqual(started, ['a']);
});

test('the sync waits for its upload as a tracked write, only so long, and fails without swapping when it runs late', () => {
  const start = app.indexOf('const syncHoldingsWithSupabase = async');
  const body = app.slice(start, app.indexOf('// A change away from a signed-in account stops', start));
  assert.ok(body.includes('const syncRun = trackHoldingWrite(() => fullSync('));
  assert.ok(body.includes('const synced = await settleWithin(syncRun, SYNC_UPLOAD_WAIT_MS, accountChanged);'));
  const late = body.indexOf('if (!synced.value) {');
  assert.ok(late > 0 && late < body.indexOf('} = synced.value;'));
  assert.ok(body.indexOf('return false;', late) < body.indexOf('} = synced.value;'));
  assert.ok(body.indexOf('setSilverItems(remoteSilver);') > body.indexOf('} = synced.value;'));
});
