// Run with: node --test mobile-app/src/utils/profileWrites.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { latestWriteQueue } from './profileWrites.js';

// A pretend profile row and a server that applies each write when it lands,
// with each request's travel time set by the test.
function fakeServer() {
  const row = { subscription_tier: 'free' };
  const log = [];
  const send = (tier, ms) => async () => {
    log.push(`sent ${tier}`);
    await new Promise((resolve) => setTimeout(resolve, ms));
    row.subscription_tier = tier;
    log.push(`landed ${tier}`);
    return { error: null };
  };
  return { row, log, send };
}

const inFlight = () => new Promise((resolve) => setTimeout(resolve, 5));

test("Codex's case: a slow free already on its way, then a Gold, ends Gold", async () => {
  const server = fakeServer();
  const queue = latestWriteQueue();
  const free = queue.write(server.send('free', 60));
  await inFlight();
  const gold = queue.write(server.send('gold', 5));
  await Promise.all([free, gold]);
  assert.equal(server.row.subscription_tier, 'gold');
  assert.deepEqual(server.log, ['sent free', 'landed free', 'sent gold', 'landed gold'], 'the Gold waits for the free to settle');
});

test('a write overtaken while it waited is skipped, and the newest still goes', async () => {
  const server = fakeServer();
  const queue = latestWriteQueue();
  const first = queue.write(server.send('gold', 30));
  await inFlight();
  const second = queue.write(server.send('free', 1));
  const third = queue.write(server.send('lifetime', 1));
  assert.deepEqual(await second, { skipped: true });
  assert.deepEqual(await third, { result: { error: null } });
  await first;
  assert.equal(server.row.subscription_tier, 'lifetime');
  assert.deepEqual(server.log, ['sent gold', 'landed gold', 'sent lifetime', 'landed lifetime']);
});

test('a write asked for when nothing is waiting goes straight out', async () => {
  const server = fakeServer();
  const queue = latestWriteQueue();
  assert.deepEqual(await queue.write(server.send('gold', 1)), { result: { error: null } });
  assert.deepEqual(await queue.write(server.send('free', 1)), { result: { error: null } });
  assert.equal(server.row.subscription_tier, 'free', 'one after another, the later one wins');
});

test('a write that is no longer wanted at its turn is skipped', async () => {
  const server = fakeServer();
  const queue = latestWriteQueue();
  let webPlanKnown = false;
  const gold = queue.write(server.send('gold', 30));
  await inFlight();
  const free = queue.write(server.send('free', 1), { stillWanted: () => !webPlanKnown });
  webPlanKnown = true; // a web plan turned up while the free waited
  await gold;
  assert.deepEqual(await free, { skipped: true });
  assert.equal(server.row.subscription_tier, 'gold');
});

test('a write that fails does not hold up the next one', async () => {
  const server = fakeServer();
  const queue = latestWriteQueue();
  const broken = queue.write(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    throw new Error('offline');
  });
  await inFlight();
  const gold = queue.write(server.send('gold', 1));
  await assert.rejects(broken, /offline/);
  assert.deepEqual(await gold, { result: { error: null } });
  assert.equal(server.row.subscription_tier, 'gold');
});

test('two writes asked for at once: only the newer goes out', async () => {
  const server = fakeServer();
  const queue = latestWriteQueue();
  const free = queue.write(server.send('free', 1));
  const gold = queue.write(server.send('gold', 1));
  assert.deepEqual(await free, { skipped: true });
  assert.deepEqual(await gold, { result: { error: null } });
  assert.deepEqual(server.log, ['sent gold', 'landed gold']);
});
