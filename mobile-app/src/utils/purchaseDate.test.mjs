// Run with: node --test mobile-app/src/utils/purchaseDate.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { purchaseDateForCloud } from './purchaseDate.js';

test('a real YYYY-MM-DD day goes up as written', () => {
  assert.equal(purchaseDateForCloud('2026-01-15'), '2026-01-15');
  assert.equal(purchaseDateForCloud('2024-02-29'), '2024-02-29');
  assert.equal(purchaseDateForCloud('2026-12-31'), '2026-12-31');
});

test('a day that is not on the calendar goes up as null', () => {
  assert.equal(purchaseDateForCloud('2026-02-30'), null);
  assert.equal(purchaseDateForCloud('2025-02-29'), null);
  assert.equal(purchaseDateForCloud('2026-04-31'), null);
  assert.equal(purchaseDateForCloud('2026-13-01'), null);
  assert.equal(purchaseDateForCloud('2026-00-10'), null);
  assert.equal(purchaseDateForCloud('2026-01-00'), null);
});

test('a year outside 1900 to 2100 goes up as null', () => {
  assert.equal(purchaseDateForCloud('0000-01-01'), null);
  assert.equal(purchaseDateForCloud('1899-12-31'), null);
  assert.equal(purchaseDateForCloud('2101-01-01'), null);
  assert.equal(purchaseDateForCloud('1900-01-01'), '1900-01-01');
  assert.equal(purchaseDateForCloud('2100-12-31'), '2100-12-31');
});

test('no date goes up as null', () => {
  assert.equal(purchaseDateForCloud(''), null);
  assert.equal(purchaseDateForCloud('   '), null);
  assert.equal(purchaseDateForCloud(null), null);
  assert.equal(purchaseDateForCloud(undefined), null);
  assert.equal(purchaseDateForCloud('not a date'), null);
});

test('surrounding spaces are trimmed', () => {
  assert.equal(purchaseDateForCloud(' 2026-01-15 '), '2026-01-15');
});

test('another date format is reformatted to its local day', () => {
  assert.equal(purchaseDateForCloud('January 5, 2026'), '2026-01-05');
  assert.equal(purchaseDateForCloud('1/5/2026'), '2026-01-05');
});
