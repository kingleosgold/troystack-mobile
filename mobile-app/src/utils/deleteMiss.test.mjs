// Run with: node --test mobile-app/src/utils/deleteMiss.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { withHoldingRestored, deleteMissAlert } from './deleteMiss.js';

const a = { id: 1, productName: 'A' };
const b = { id: 2, productName: 'B' };
const c = { id: 3, productName: 'C' };

test('the holding goes back at its old place', () => {
  assert.deepEqual(withHoldingRestored([a, c], b, 1), [a, b, c]);
  assert.deepEqual(withHoldingRestored([b, c], a, 0), [a, b, c]);
  assert.deepEqual(withHoldingRestored([a, b], c, 2), [a, b, c]);
});

test('a place past the end, or none, puts it last', () => {
  assert.deepEqual(withHoldingRestored([a], b, 5), [a, b]);
  assert.deepEqual(withHoldingRestored([a], b, -1), [a, b]);
  assert.deepEqual(withHoldingRestored([a], b, undefined), [a, b]);
  assert.deepEqual(withHoldingRestored([], b, 3), [b]);
});

test('a holding already there is never added twice', () => {
  const items = [a, b];
  assert.equal(withHoldingRestored(items, { ...b, productName: 'B old' }, 0), items);
});

test('no holding leaves the list alone', () => {
  const items = [a];
  assert.equal(withHoldingRestored(items, null, 0), items);
  assert.equal(withHoldingRestored(items, undefined, 0), items);
});

test('the restored holding is the same object, so its marks come back with it', () => {
  const marked = { id: 9, productName: 'Marked', retryFor: 'user-1' };
  assert.equal(withHoldingRestored([a], marked, 0)[0], marked);
});

test('the notice names the holding and says it is still in the account', () => {
  const { title, message } = deleteMissAlert('American Silver Eagle');
  assert.equal(title, "Couldn't delete");
  assert.ok(message.startsWith('American Silver Eagle is still in your account'));
  assert.ok(message.includes('back in your stack'));
  assert.ok(message.includes('delete it again'));
});

test('a blank or missing name reads as this holding', () => {
  assert.ok(deleteMissAlert('').message.startsWith('This holding is still'));
  assert.ok(deleteMissAlert('   ').message.startsWith('This holding is still'));
  assert.ok(deleteMissAlert(null).message.startsWith('This holding is still'));
});

test('a long name is cut and a closing stop dropped', () => {
  const long = 'x'.repeat(60);
  assert.ok(deleteMissAlert(long).message.startsWith(`${'x'.repeat(39)}… is still`));
  assert.ok(deleteMissAlert('Generic round.').message.startsWith('Generic round is still'));
});

test('the words carry no em dash', () => {
  const { title, message } = deleteMissAlert('A');
  assert.ok(!`${title}${message}`.includes('—'));
});
