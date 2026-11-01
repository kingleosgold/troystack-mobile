// Run with: node --test mobile-app/src/utils/todaysValue.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { todaysUnitValue, offersTodaysValue, applyTodaysValue, formAfterTodaysValueChange, localDateString } from './todaysValue.js';

const today = '2026-10-31';

test('one unit is its weight times live spot, to the cent', () => {
  assert.equal(todaysUnitValue({ ozt: '1', spot: 77.123, live: true }), '77.12');
  assert.equal(todaysUnitValue({ ozt: '10', spot: 77.125, live: true }), '771.25');
  assert.equal(todaysUnitValue({ ozt: '0.1', spot: 4530, live: true }), '453.00');
  assert.equal(todaysUnitValue({ ozt: 32.1507, spot: 77, live: true }), '2475.60');
});

test('no offer without a live spot, so the placeholder spot never becomes a price', () => {
  assert.equal(todaysUnitValue({ ozt: '1', spot: 77, live: false }), null);
  assert.equal(todaysUnitValue({ ozt: '1', spot: 77, live: undefined }), null);
});

test('no offer without a positive weight or spot', () => {
  for (const ozt of ['', ' ', '0', '-1', 'abc', undefined, null, 0, NaN]) {
    assert.equal(todaysUnitValue({ ozt, spot: 77, live: true }), null, String(ozt));
  }
  for (const spot of [0, -5, NaN, Infinity, undefined, null, '77']) {
    assert.equal(todaysUnitValue({ ozt: '1', spot, live: true }), null, String(spot));
  }
});

test('a value that rounds to nothing is not offered', () => {
  assert.equal(todaysUnitValue({ ozt: '0.0001', spot: 1, live: true }), null);
});

test('offered on a new add with no positive price typed', () => {
  assert.equal(offersTodaysValue({ unitPrice: '' }, { editing: false, today }), true);
  assert.equal(offersTodaysValue({ unitPrice: '0' }, { editing: false, today }), true);
  assert.equal(offersTodaysValue({ unitPrice: '.' }, { editing: false, today }), true);
  assert.equal(offersTodaysValue({}, { editing: false, today }), true);
});

test('not offered once a price is typed, or on any edit', () => {
  assert.equal(offersTodaysValue({ unitPrice: '32.50' }, { editing: false, today }), false);
  assert.equal(offersTodaysValue({ unitPrice: '' }, { editing: true, today }), false);
});

test('offered with no date or today\'s, never on a past or future date', () => {
  assert.equal(offersTodaysValue({ unitPrice: '', datePurchased: '' }, { editing: false, today }), true);
  assert.equal(offersTodaysValue({ unitPrice: '', datePurchased: today }, { editing: false, today }), true);
  assert.equal(offersTodaysValue({ unitPrice: '', datePurchased: '2019-05-01' }, { editing: false, today }), false);
  assert.equal(offersTodaysValue({ unitPrice: '', datePurchased: '2026-11-01' }, { editing: false, today }), false);
});

test('taking today\'s value sets today\'s spot, no premium and clears a typed total', () => {
  const form = { productName: 'American Silver Eagle', ozt: '1', quantity: '3', unitPrice: '', spotPrice: '17.10', premium: '4.00', costBasis: '120.00', taxes: '2', shipping: '' };
  const after = applyTodaysValue(form, { value: '77.12', spot: 77.123, metal: 'silver' });
  assert.equal(after.unitPrice, '77.12');
  assert.equal(after.spotPrice, '77.123');
  assert.equal(after.premium, '0');
  assert.equal(after.costBasis, '');
  assert.equal(after.quantity, '3');
  assert.equal(after.taxes, '2');
  assert.equal(after.productName, 'American Silver Eagle');
});

test('the local date string is the phone\'s calendar day', () => {
  assert.equal(localDateString(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(localDateString(new Date(2026, 11, 31, 0, 1)), '2026-12-31');
});

const taken = () => applyTodaysValue(
  { productName: 'American Silver Eagle', ozt: '1', quantity: '1', unitPrice: '', spotPrice: '', premium: '0', costBasis: '' },
  { value: '77.12', spot: 77.123, metal: 'silver' },
);

test('the price taken stays while its metal and weight do', () => {
  const form = taken();
  assert.equal(formAfterTodaysValueChange(form, 'silver', today), form);
});

test('a metal change clears the price taken, so gold never saves at silver\'s value', () => {
  const after = formAfterTodaysValueChange({ ...taken(), productName: 'American Gold Eagle' }, 'gold', today);
  assert.equal(after.unitPrice, '');
  assert.equal(after.premium, '0');
  assert.equal(after.todaysValueFor, undefined);
  assert.equal(after.productName, 'American Gold Eagle');
});

test('a weight change clears the price taken', () => {
  const after = formAfterTodaysValueChange({ ...taken(), ozt: '10' }, 'silver', today);
  assert.equal(after.unitPrice, '');
  assert.equal(after.todaysValueFor, undefined);
});

test('a price typed over today\'s value stays through a change and loses the mark', () => {
  const after = formAfterTodaysValueChange({ ...taken(), unitPrice: '30', ozt: '10' }, 'gold', today);
  assert.equal(after.unitPrice, '30');
  assert.equal(after.todaysValueFor, undefined);
});

test('a form with no price taken passes through untouched', () => {
  const form = { unitPrice: '30', ozt: '1' };
  assert.equal(formAfterTodaysValueChange(form, 'gold', today), form);
});

test('a past purchase date clears the price taken, so no made-up premium saves', () => {
  const after = formAfterTodaysValueChange({ ...taken(), datePurchased: '2019-05-01' }, 'silver', today);
  assert.equal(after.unitPrice, '');
  assert.equal(after.premium, '0');
  assert.equal(after.todaysValueFor, undefined);
});

test('today\'s date keeps the price taken', () => {
  const form = { ...taken(), datePurchased: today };
  assert.equal(formAfterTodaysValueChange(form, 'silver', today), form);
});

test('a price typed over it stays when a past date is picked', () => {
  const after = formAfterTodaysValueChange({ ...taken(), unitPrice: '30', datePurchased: '2019-05-01' }, 'silver', today);
  assert.equal(after.unitPrice, '30');
  assert.equal(after.todaysValueFor, undefined);
});

// The add form as App.js runs it: the auto premium step after each change.
import { formWithTypedPremium, premiumForSave, formAfterPriceChange as autoPremium } from './spotSave.js';

test('today\'s value then a cleared spot saves no premium, not one typed before it', () => {
  let form = { ozt: '1', quantity: '1', unitPrice: '', spotPrice: '', premium: '0', costBasis: '' };
  form = formWithTypedPremium(form, '5');
  form = autoPremium({ ...form, unitPrice: '80', spotPrice: '70' });
  assert.equal(form.premium, '10.00');
  form = autoPremium(applyTodaysValue(form, { value: '77.12', spot: 77.12, metal: 'silver' }));
  assert.equal(form.premium, '0.00');
  assert.equal(premiumForSave({ ...form, spotPrice: '' }), 0);
});

test('today\'s value drops the spot premium marks', () => {
  const after = applyTodaysValue(
    { ozt: '1', unitPrice: '', spotPrice: '70', premium: '3.00', premiumFromSpot: '3.00', premiumBeforeSpot: '5' },
    { value: '77.12', spot: 77.12, metal: 'silver' },
  );
  assert.equal(after.premiumFromSpot, undefined);
  assert.equal(after.premiumBeforeSpot, undefined);
  assert.equal(premiumForSave({ ...after, spotPrice: '' }), 0);
});

test('clearing the price taken drops the spot premium marks too', () => {
  const form = { ...taken(), premium: '0.00', premiumFromSpot: '0.00', premiumBeforeSpot: '5' };
  const after = formAfterTodaysValueChange({ ...form, ozt: '10' }, 'silver', today);
  assert.equal(after.premium, '0');
  assert.equal(after.premiumFromSpot, undefined);
  assert.equal(after.premiumBeforeSpot, undefined);
  assert.equal(premiumForSave({ ...after, spotPrice: '' }), 0);
});
