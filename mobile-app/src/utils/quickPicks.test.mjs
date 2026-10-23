// Run with: node --test mobile-app/src/utils/quickPicks.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { QUICK_PICKS, quickPicksFor, applyQuickPick, isQuickPickChosen } from './quickPicks.js';

const blankForm = {
  productName: '', source: '', datePurchased: '', timePurchased: '', ozt: '',
  quantity: '', unitPrice: '', taxes: '', shipping: '',
  spotPrice: '', premium: '0', costBasis: '',
};

test('every metal on the add form has picks, each with a name and a positive weight', () => {
  for (const metal of ['silver', 'gold', 'platinum', 'palladium']) {
    const picks = quickPicksFor(metal);
    assert.ok(picks.length > 0, metal);
    const names = new Set();
    for (const pick of picks) {
      assert.ok(pick.label && pick.productName, `${metal} ${pick.label}`);
      assert.ok(Number.isFinite(pick.ozt) && pick.ozt > 0, `${metal} ${pick.label}`);
      assert.ok(!names.has(pick.productName), `${metal} ${pick.productName} twice`);
      names.add(pick.productName);
    }
  }
});

test('anything that is not one of the four metals has no picks', () => {
  assert.deepEqual(quickPicksFor('all'), []);
  assert.deepEqual(quickPicksFor('both'), []);
  assert.deepEqual(quickPicksFor(undefined), []);
});

test('the weights are the fine troy ounces each piece holds', () => {
  const ozt = (metal, name) => QUICK_PICKS[metal].find(p => p.productName === name).ozt;
  assert.equal(ozt('silver', 'American Silver Eagle'), 1);
  assert.equal(ozt('silver', '10 oz Silver Bar'), 10);
  assert.equal(ozt('silver', '100 oz Silver Bar'), 100);
  // 1000 g over 31.1034768 g per troy ounce
  assert.ok(Math.abs(ozt('silver', '1 Kilo Silver Bar') - 1000 / 31.1034768) < 0.0001);
  assert.equal(ozt('gold', 'American Gold Eagle'), 1);
  assert.equal(ozt('gold', '1/10 oz American Gold Eagle'), 0.1);
  assert.equal(ozt('platinum', 'American Platinum Eagle'), 1);
  assert.equal(ozt('palladium', 'Canadian Palladium Maple Leaf'), 1);
});

test('a pick on a blank form fills the name, the ozt and a quantity of 1', () => {
  const pick = QUICK_PICKS.silver.find(p => p.productName === '10 oz Silver Bar');
  const form = applyQuickPick(blankForm, pick);
  assert.equal(form.productName, '10 oz Silver Bar');
  assert.equal(form.ozt, '10');
  assert.equal(form.quantity, '1');
});

test('a pick never touches the price, the dealer, the date or any cost field', () => {
  const typed = { ...blankForm, source: 'APMEX', datePurchased: '2026-10-01', unitPrice: '42.10', taxes: '1', shipping: '5', spotPrice: '38.5', premium: '3.6', costBasis: '48.10' };
  const form = applyQuickPick(typed, QUICK_PICKS.silver[0]);
  for (const key of ['source', 'datePurchased', 'timePurchased', 'unitPrice', 'taxes', 'shipping', 'spotPrice', 'premium', 'costBasis']) {
    assert.equal(form[key], typed[key], key);
  }
});

test('a quantity already typed stays, and a blank or zero one becomes 1', () => {
  const pick = QUICK_PICKS.gold[0];
  assert.equal(applyQuickPick({ ...blankForm, quantity: '20' }, pick).quantity, '20');
  assert.equal(applyQuickPick({ ...blankForm, quantity: '0' }, pick).quantity, '1');
  assert.equal(applyQuickPick({ ...blankForm, quantity: '  ' }, pick).quantity, '1');
  assert.equal(applyQuickPick({ ...blankForm, quantity: undefined }, pick).quantity, '1');
});

test('a pick replaces a name and weight from an earlier pick', () => {
  const first = applyQuickPick(blankForm, QUICK_PICKS.silver[0]);
  const second = applyQuickPick(first, QUICK_PICKS.silver.find(p => p.ozt === 100));
  assert.equal(second.productName, '100 oz Silver Bar');
  assert.equal(second.ozt, '100');
  assert.equal(second.quantity, '1');
});

test('the chosen pick is the one whose name and weight the form holds', () => {
  const pick = QUICK_PICKS.gold[0];
  const form = applyQuickPick(blankForm, pick);
  assert.equal(isQuickPickChosen(form, pick), true);
  assert.equal(isQuickPickChosen(form, QUICK_PICKS.gold[1]), false);
  assert.equal(isQuickPickChosen({ ...form, ozt: '2' }, pick), false);
  assert.equal(isQuickPickChosen(blankForm, pick), false);
});
