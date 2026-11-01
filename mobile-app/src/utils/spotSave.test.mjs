// Run with: node --test mobile-app/src/utils/spotSave.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spotForSave, premiumForSave, formWithSpotPremium, formWithTypedPremium, openedPremium } from './spotSave.js';

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

const app = readFileSync(new URL('../../App.js', import.meta.url), 'utf8');

test('savePurchase saves the spot and premium through the guard', () => {
  assert.match(app, /spotPrice: spotForSave\(form\.spotPrice\),/);
  assert.match(app, /premium: premiumForSave\(form\),/);
});

test('editItem and editScannedItem open the premium through openedPremium', () => {
  assert.equal(app.match(/\.\.\.openedPremium\(item\.spotPrice, item\.premium\),/g)?.length, 2);
  assert.ok(!app.includes('premium: item.premium.toString(),'));
});

test('the worked out premium is marked, and typing a premium clears the mark', () => {
  assert.match(app, /setForm\(prev => formWithSpotPremium\(prev, premium\)\)/);
  assert.match(app, /label="Per Unit" value=\{form\.premium\} onChangeText=\{v => setForm\(p => formWithTypedPremium\(p, v\)\)\}/);
});
