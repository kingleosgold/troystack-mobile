// Run with: node --test mobile-app/src/utils/refusedAlert.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { refusedHoldingsAlert } from './refusedAlert.js';

test('one refused holding is named', () => {
  assert.deepEqual(refusedHoldingsAlert(['2024 Silver Eagle']), {
    title: "A holding didn't save to your account",
    message: "2024 Silver Eagle. It's still on this phone. Check the numbers and save again, and the next sync sends it up.",
  });
});

test('up to three are named and the rest counted', () => {
  const { title, message } = refusedHoldingsAlert(['A', 'B', 'C', 'D', 'E']);
  assert.equal(title, "5 holdings didn't save to your account");
  assert.ok(message.startsWith("A, B, C, and 2 more. They're still on this phone."));
  assert.ok(message.endsWith('sends them up.'));
});

test('a holding with no name still gets a label', () => {
  const { message } = refusedHoldingsAlert(['', 'Gold Bar', undefined]);
  assert.ok(message.startsWith('A holding with no name, Gold Bar, and a holding with no name. '));
});

test('two names read as a pair', () => {
  assert.ok(refusedHoldingsAlert(['A', 'B']).message.startsWith("A and B. They're"));
});

test("a name's closing stop isn't doubled and a long name is cut", () => {
  assert.ok(refusedHoldingsAlert(['Silver Eagle 1 oz.']).message.startsWith("Silver Eagle 1 oz. It's"));
  const long = 'x'.repeat(80);
  assert.ok(refusedHoldingsAlert([long]).message.startsWith(`${'x'.repeat(39)}…. It's`));
});
