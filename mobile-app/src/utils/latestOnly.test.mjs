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

test('a typed spot keeps the ticket current but stops it filling the spot', () => {
  const gate = createLatestOnly();
  const t = gate.begin();
  assert.equal(gate.mayFill(t), true);
  gate.keepSpot('2500.00');
  assert.equal(gate.isCurrent(t), true);
  assert.equal(gate.mayFill(t), false);
});

test('a typed spot still gets the comparison suggestion from a pending reply', async () => {
  const gate = createLatestOnly();
  let spot = '';
  let suggestion = null;
  const ticket = gate.begin();
  const pending = new Promise((r) => setTimeout(r, 5)).then(() => {
    if (!gate.isCurrent(ticket)) return;
    suggestion = '2000.00';
    if (gate.mayFill(ticket)) spot = '2000.00';
  });
  gate.keepSpot('2500.00');
  spot = '2500.00';
  await pending;
  assert.equal(spot, '2500.00');
  assert.equal(suggestion, '2000.00');
});

test('clearing a typed spot lets a pending reply fill it again', async () => {
  const gate = createLatestOnly();
  let spot = '';
  const ticket = gate.begin();
  const pending = new Promise((r) => setTimeout(r, 5)).then(() => {
    if (gate.mayFill(ticket)) spot = '2000.00';
  });
  gate.keepSpot('25');
  gate.keepSpot('');
  await pending;
  assert.equal(spot, '2000.00');
});

test('a blank or whitespace spot keeps nothing', () => {
  const gate = createLatestOnly();
  const t = gate.begin();
  gate.keepSpot('   ');
  assert.equal(gate.mayFill(t), true);
  gate.keepSpot(undefined);
  assert.equal(gate.mayFill(t), true);
  gate.keepSpot(null);
  assert.equal(gate.mayFill(t), true);
});

test('a spot that is not a price above zero yet keeps nothing', () => {
  const gate = createLatestOnly();
  const t = gate.begin();
  for (const v of ['0', '.', '0.', '0.00', '00', ' 0 ']) {
    gate.keepSpot(v);
    assert.equal(gate.mayFill(t), true, `"${v}" should not keep the spot`);
  }
});

test('any price above zero keeps the spot', () => {
  for (const v of ['1', '.5', '0.5', '4500', '4500.25', ' 25 ']) {
    const gate = createLatestOnly();
    const t = gate.begin();
    gate.keepSpot(v);
    assert.equal(gate.mayFill(t), false, `"${v}" should keep the spot`);
  }
});

test('typing a price then backing it down to "0" lets a pending reply fill', async () => {
  const gate = createLatestOnly();
  let spot = '';
  const ticket = gate.begin();
  const pending = new Promise((r) => setTimeout(r, 5)).then(() => {
    if (gate.mayFill(ticket)) spot = '2000.00';
  });
  gate.keepSpot('25');
  gate.keepSpot('0');
  await pending;
  assert.equal(spot, '2000.00');
});

test('a new lookup after a typed spot may fill again', () => {
  const gate = createLatestOnly();
  gate.begin();
  gate.keepSpot('2500.00');
  const t = gate.begin();
  assert.equal(gate.mayFill(t), true);
});

test('mayFill is false for a stale ticket', () => {
  const gate = createLatestOnly();
  const old = gate.begin();
  gate.begin();
  assert.equal(gate.mayFill(old), false);
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

  test(`${name} fills the spot only through mayFill`, () => {
    const src = body(name);
    // handleMetalTabChange's no-date branch sets the live spot with no lookup
    const end = src.indexOf('// No date');
    const after = src.slice(src.indexOf('await fetchHistoricalSpot'), end > 0 ? end : undefined);
    const fills = after.split('spotPrice:').length - 1;
    const guards = after.split('spotLookupGate.current.mayFill(ticket)').length - 1;
    assert.ok(fills > 0, 'expected a spot fill after the lookup');
    assert.equal(guards, fills, 'every spot fill after the lookup needs a mayFill guard');
  });
}

test('editItem auto-fills an unrecorded spot only through mayFill', () => {
  const src = body('editItem');
  assert.match(src, /spotLookupGate\.current\.isCurrent\(ticket\)/);
  assert.match(src, /spotPrice === 0 && spotLookupGate\.current\.mayFill\(ticket\)/);
});

test('resetForm drops any pending spot lookup', () => {
  const start = app.indexOf('const resetForm = () =>');
  const src = app.slice(start, app.indexOf('\n  };', start));
  assert.match(src, /spotLookupGate\.current\.begin\(\)/);
});

test('typing a spot keeps it from a pending lookup, taking today\'s value drops the lookup', () => {
  assert.match(app, /onChangeText=\{v => \{ spotLookupGate\.current\.keepSpot\(v\); setForm\(p => \(\{ \.\.\.p, spotPrice: v \}\)\)/);
  assert.match(app, /spotLookupGate\.current\.begin\(\);\n\s*setForm\(p => applyTodaysValue\(/);
});
