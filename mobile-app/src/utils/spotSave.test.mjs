// Run with: node --test mobile-app/src/utils/spotSave.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spotForSave, premiumForSave, formWithSpotPremium, formWithTypedPremium, openedPremium, formAfterSpotCleared, formAfterPriceChange } from './spotSave.js';

test('a blank, zero, negative or unreadable spot saves as no spot', () => {
  for (const spot of ['', '   ', '0', '0.00', '.', '-5', 'abc', undefined, null]) {
    assert.equal(spotForSave(spot), 0, `spot ${JSON.stringify(spot)}`);
  }
});

test('a real spot saves as its number', () => {
  assert.equal(spotForSave('2650.40'), 2650.4);
  assert.equal(spotForSave(' 31.5 '), 31.5);
  assert.equal(spotForSave(31.5), 31.5);
});

test('a new holding: a spot fills, then is cleared, saves no premium', () => {
  let form = { spotPrice: '', premium: '0' };
  form = { ...formWithSpotPremium({ ...form, spotPrice: '30' }, '4.50') };
  assert.equal(premiumForSave(form), 4.5);
  form = { ...form, spotPrice: '' };
  assert.equal(premiumForSave(form), 0);
  assert.equal(premiumForSave({ ...form, spotPrice: '0' }), 0);
  assert.equal(premiumForSave({ ...form, spotPrice: '.' }), 0);
});

test('an edit: a premium the holding had comes back when the filled spot is cleared', () => {
  // Saved with no spot and a typed premium of 6; opening it fills a historical spot
  let form = { spotPrice: '0', premium: '6' };
  form = formWithSpotPremium({ ...form, spotPrice: '30' }, '4.50');
  // The spot changes again before it's cleared, and the first premium is still kept
  form = formWithSpotPremium({ ...form, spotPrice: '31' }, '3.50');
  form = { ...form, spotPrice: '' };
  assert.equal(premiumForSave(form), 6);
});

test('a premium typed before the spot comes back when the spot is cleared', () => {
  let form = formWithTypedPremium({ spotPrice: '', premium: '0' }, '7');
  form = formWithSpotPremium({ ...form, spotPrice: '30' }, '4.50');
  form = { ...form, spotPrice: '' };
  assert.equal(premiumForSave(form), 7);
});

test('a premium typed after the spot is kept, with or without the spot', () => {
  let form = formWithSpotPremium({ spotPrice: '30', premium: '0' }, '4.50');
  form = formWithTypedPremium(form, '4.50');
  assert.equal(premiumForSave(form), 4.5);
  assert.equal(premiumForSave({ ...form, spotPrice: '' }), 4.5);
  form = formWithTypedPremium(form, '8');
  assert.equal(premiumForSave({ ...form, spotPrice: '' }), 8);
});

test('with no mark, the premium saves as the field holds it', () => {
  assert.equal(premiumForSave({ spotPrice: '', premium: '6' }), 6);
  assert.equal(premiumForSave({ spotPrice: '30', premium: '' }), 0);
  assert.equal(premiumForSave({ spotPrice: '', premium: 'x' }), 0);
});

test('an edit of a holding with a recorded spot saves no premium once the spot is cleared', () => {
  let form = { spotPrice: '30', ...openedPremium(30, 4.5) };
  form = formWithSpotPremium(form, '4.50');
  assert.equal(premiumForSave(form), 4.5);
  assert.equal(premiumForSave({ ...form, spotPrice: '' }), 0);
});

test('a holding opened with no spot keeps its premium unmarked', () => {
  assert.deepEqual(openedPremium(0, 6), { premium: '6' });
  assert.deepEqual(openedPremium(undefined, undefined), { premium: '0' });
  assert.equal(premiumForSave({ spotPrice: '0', ...openedPremium(0, 6) }), 6);
});

test('clearing the spot shows 0 on a new holding, the same premium that saves', () => {
  let form = formWithSpotPremium({ spotPrice: '30', premium: '0' }, '4.50');
  form = formAfterSpotCleared({ ...form, spotPrice: '' });
  assert.equal(form.premium, '0');
  assert.equal(form.premiumFromSpot, undefined);
  assert.equal(form.premiumBeforeSpot, undefined);
  assert.equal(premiumForSave(form), 0);
});

test('clearing the spot shows a typed premium from before the spot', () => {
  let form = formWithTypedPremium({ spotPrice: '', premium: '0' }, '7.50');
  form = formWithSpotPremium({ ...form, spotPrice: '30' }, '4.50');
  form = formWithSpotPremium({ ...form, spotPrice: '31' }, '3.50');
  for (const spot of ['', '0', '.', '-5']) {
    const cleared = formAfterSpotCleared({ ...form, spotPrice: spot });
    assert.equal(cleared.premium, '7.50', `spot ${JSON.stringify(spot)}`);
    assert.equal(premiumForSave(cleared), 7.5);
  }
});

test('clearing the spot on an opened holding with a recorded spot shows 0', () => {
  let form = { spotPrice: '30', ...openedPremium(30, 4.5) };
  form = formAfterSpotCleared({ ...form, spotPrice: '' });
  assert.equal(form.premium, '0');
  assert.equal(premiumForSave(form), 0);
});

test('a premium typed over the worked-out one stays when the spot is cleared', () => {
  let form = formWithSpotPremium({ spotPrice: '30', premium: '0' }, '4.50');
  form = { ...formWithTypedPremium(form, '9'), spotPrice: '' };
  assert.equal(formAfterSpotCleared(form), form);
  assert.equal(premiumForSave(form), 9);
});

test('a form with a spot or no marks comes back as the same object', () => {
  const withSpot = formWithSpotPremium({ spotPrice: '30', premium: '0' }, '4.50');
  assert.equal(formAfterSpotCleared(withSpot), withSpot);
  const blank = { spotPrice: '', premium: '0' };
  assert.equal(formAfterSpotCleared(blank), blank);
});

test('a new spot after a clear works its premium out over the given-back one', () => {
  let form = formWithTypedPremium({ spotPrice: '', premium: '0' }, '7');
  form = formWithSpotPremium({ ...form, spotPrice: '30' }, '4.50');
  form = formAfterSpotCleared({ ...form, spotPrice: '' });
  form = formWithSpotPremium({ ...form, spotPrice: '32' }, '2.50');
  assert.equal(form.premiumBeforeSpot, '7');
  form = formAfterSpotCleared({ ...form, spotPrice: '' });
  assert.equal(form.premium, '7');
});

test('an unreadable premium from before the spot shows 0', () => {
  const form = { spotPrice: '', premium: '4.50', premiumFromSpot: '4.50', premiumBeforeSpot: undefined };
  assert.equal(formAfterSpotCleared(form).premium, '0');
  assert.equal(formAfterSpotCleared({ ...form, premiumBeforeSpot: 'abc' }).premium, '0');
});

const app = readFileSync(new URL('../../App.js', import.meta.url), 'utf8');

test('savePurchase saves the spot and premium through the guard', () => {
  assert.match(app, /spotPrice: spotForSave\(form\.spotPrice\),/);
  assert.match(app, /premium: premiumForSave\(form\),/);
});

test('editItem and editScannedItem open the premium through openedPremium', () => {
  assert.equal(app.match(/\.\.\.openedPremium\(item\.spotPrice, item\.premium, item\.unitPrice, item\.ozt\),/g)?.length, 2);
  assert.ok(!app.includes('premium: item.premium.toString(),'));
});

test('the auto premium effect runs formAfterPriceChange, and typing a premium clears the mark', () => {
  assert.match(app, /useEffect\(\(\) => \{\s*setForm\(prev => formAfterPriceChange\(prev\)\);\s*\}, \[form\.unitPrice, form\.spotPrice, form\.ozt\]\);/);
  assert.match(app, /label="Per Unit" value=\{form\.premium\} onChangeText=\{v => setForm\(p => formWithTypedPremium\(p, v\)\)\}/);
});

test('a unit price, spot and weight work the premium out to the cent and mark it', () => {
  const after = formAfterPriceChange({ unitPrice: '85', spotPrice: '77.125', ozt: '1', premium: '2' });
  assert.equal(after.premium, '7.88');
  assert.equal(after.premiumFromSpot, '7.88');
  assert.equal(after.premiumBeforeSpot, '2');
  assert.equal(formAfterPriceChange({ unitPrice: '1600', spotPrice: '77', ozt: '20', premium: '0' }).premium, '60.00');
});

test('a spot above the unit price works out a premium of 0, never below', () => {
  assert.equal(formAfterPriceChange({ unitPrice: '70', spotPrice: '77', ozt: '1', premium: '0' }).premium, '0.00');
});

test('a cleared spot gives back the premium from before it', () => {
  const worked = formAfterPriceChange({ unitPrice: '85', spotPrice: '77', ozt: '1', premium: '5' });
  const cleared = formAfterPriceChange({ ...worked, spotPrice: '' });
  assert.equal(cleared.premium, '5');
  assert.equal(cleared.premiumFromSpot, undefined);
  assert.equal(premiumForSave(cleared), 5);
});

test('a spot with no unit price or weight leaves the form as it was', () => {
  const noPrice = { unitPrice: '', spotPrice: '77', ozt: '1', premium: '4' };
  assert.equal(formAfterPriceChange(noPrice), noPrice);
  const noWeight = { unitPrice: '85', spotPrice: '77', ozt: '', premium: '4' };
  assert.equal(formAfterPriceChange(noWeight), noWeight);
});

test('a typed premium stays when the spot is cleared', () => {
  const form = formWithTypedPremium(formAfterPriceChange({ unitPrice: '85', spotPrice: '77', ozt: '1', premium: '0' }), '9');
  assert.equal(formAfterPriceChange({ ...form, spotPrice: '' }).premium, '9');
});

// A holding opened for editing, as editItem and editScannedItem build the form
const opened = (item) => ({
  unitPrice: item.unitPrice.toString(),
  spotPrice: item.spotPrice.toString(),
  ozt: item.ozt.toString(),
  ...openedPremium(item.spotPrice, item.premium, item.unitPrice, item.ozt),
});

test('opening a holding keeps a typed premium the spot would rework', () => {
  // Saved at $85 on a $77 spot with a typed premium of $5, not the $8 the spot gives
  const form = opened({ unitPrice: 85, spotPrice: 77, ozt: 1, premium: 5 });
  const after = formAfterPriceChange(form);
  assert.equal(after, form);
  assert.equal(after.premium, '5');
  assert.equal(premiumForSave(after), 5);
});

test('opening a holding saved below spot keeps its premium rather than 0', () => {
  // A scan saves a negative premium when the price came in under spot
  const form = opened({ unitPrice: 70, spotPrice: 77, ozt: 1, premium: -7 });
  const after = formAfterPriceChange(form);
  assert.equal(after.premium, '-7');
  assert.equal(premiumForSave(after), -7);
});

test('the same values written another way still count as unchanged', () => {
  const form = opened({ unitPrice: 85, spotPrice: 77, ozt: 1, premium: 5 });
  const after = formAfterPriceChange({ ...form, unitPrice: '85.00', ozt: '1.0' });
  assert.equal(after.premium, '5');
});

test('changing the unit price, spot or weight works the premium out again', () => {
  const form = opened({ unitPrice: 85, spotPrice: 77, ozt: 1, premium: 5 });
  for (const change of [{ unitPrice: '90' }, { spotPrice: '76' }, { ozt: '0.5' }]) {
    const after = formAfterPriceChange({ ...form, ...change });
    const expected = Math.max(0, parseFloat(change.unitPrice ?? 85) - parseFloat(change.spotPrice ?? 77) * parseFloat(change.ozt ?? 1)).toFixed(2);
    assert.equal(after.premium, expected, JSON.stringify(change));
    assert.equal(after.premiumOpenedOn, undefined);
  }
});

test('changing a value and back works the premium out from the values shown', () => {
  let form = opened({ unitPrice: 85, spotPrice: 77, ozt: 1, premium: 5 });
  form = formAfterPriceChange({ ...form, unitPrice: '86' });
  assert.equal(form.premium, '9.00');
  form = formAfterPriceChange({ ...form, unitPrice: '85' });
  assert.equal(form.premium, '8.00');
});

test('clearing the spot on an opened holding still saves no premium', () => {
  const form = opened({ unitPrice: 85, spotPrice: 77, ozt: 1, premium: 5 });
  const after = formAfterPriceChange({ ...form, spotPrice: '' });
  assert.equal(after.premium, '0');
  assert.equal(premiumForSave(after), 0);
});

test('a premium typed on an opened holding stays while the values do', () => {
  const form = formWithTypedPremium(opened({ unitPrice: 85, spotPrice: 77, ozt: 1, premium: 5 }), '6');
  assert.equal(formAfterPriceChange(form).premium, '6');
  assert.equal(premiumForSave(formAfterPriceChange(form)), 6);
});

test('a holding opened with no spot takes no mark and fills from a looked-up spot', () => {
  const form = opened({ unitPrice: 85, spotPrice: 0, ozt: 1, premium: 6 });
  assert.equal(form.premiumOpenedOn, undefined);
  const filled = formAfterPriceChange({ ...form, spotPrice: '77' });
  assert.equal(filled.premium, '8.00');
  assert.equal(premiumForSave({ ...filled, spotPrice: '' }), 6);
});
