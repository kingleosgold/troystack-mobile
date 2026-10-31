// Run with: node --test mobile-app/src/utils/latestOnly.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLatestOnly } from './latestOnly.js';

test('a fresh ticket is current', () => {
  const gate = createLatestOnly();
  const t = gate.begin();
  assert.equal(gate.isCurrent(t), true);
});

test('an earlier ticket stops being current once a newer one starts', () => {
  const gate = createLatestOnly();
  const first = gate.begin();
  const second = gate.begin();
  assert.equal(gate.isCurrent(first), false);
  assert.equal(gate.isCurrent(second), true);
});

test('a late reply for an earlier date is dropped and the newer one lands', async () => {
  const gate = createLatestOnly();
  let spot = '';
  const lookup = (price, delay) => {
    const ticket = gate.begin();
    return new Promise((r) => setTimeout(r, delay)).then(() => {
      if (gate.isCurrent(ticket)) spot = price;
    });
  };
  const slowOld = lookup('2000.00', 30);
  const fastNew = lookup('4500.00', 5);
  await Promise.all([slowOld, fastNew]);
  assert.equal(spot, '4500.00');
});

test('a reset with no lookup still drops a pending reply', async () => {
  const gate = createLatestOnly();
  let spot = '';
  const ticket = gate.begin();
  const pending = Promise.resolve().then(() => {
    if (gate.isCurrent(ticket)) spot = '2000.00';
  });
  gate.begin();
  await pending;
  assert.equal(spot, '');
});

test('separate gates do not affect each other', () => {
  const a = createLatestOnly();
  const b = createLatestOnly();
  const ta = a.begin();
  b.begin();
  assert.equal(a.isCurrent(ta), true);
});

// App.js wiring: every spot lookup on the add form checks the gate, and a
// reset or a new edit starts a fresh ticket.
const app = readFileSync(new URL('../../App.js', import.meta.url), 'utf8');
const body = (name) => {
  const start = app.indexOf(`const ${name} = async`);
  assert.ok(start > 0, `${name} not found`);
  const next = app.indexOf('\n  const ', start + 10);
  return app.slice(start, next);
};

for (const name of ['handleDateChange', 'handleTimeChange', 'handleMetalTabChange']) {
  test(`${name} takes a ticket and applies its reply only while current`, () => {
    const src = body(name);
    assert.match(src, /spotLookupGate\.current\.begin\(\)/);
    assert.match(src, /spotLookupGate\.current\.isCurrent\(ticket\)/);
    assert.ok(
      src.indexOf('begin()') < src.indexOf('await fetchHistoricalSpot'),
      'ticket must be taken before the lookup starts',
    );
  });
}

test('resetForm drops any pending spot lookup', () => {
  const start = app.indexOf('const resetForm = () =>');
  const src = app.slice(start, app.indexOf('\n  };', start));
  assert.match(src, /spotLookupGate\.current\.begin\(\)/);
});

test('typing a spot or taking today\'s value drops a pending lookup', () => {
  assert.match(app, /onChangeText=\{v => \{ spotLookupGate\.current\.begin\(\); setForm\(p => \(\{ \.\.\.p, spotPrice: v \}\)\)/);
  assert.match(app, /spotLookupGate\.current\.begin\(\);\n\s*setForm\(p => applyTodaysValue\(/);
});
