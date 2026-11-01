// Run with: node --test mobile-app/src/utils/spotSave.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spotForSave, premiumForSave } from './spotSave.js';

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

test('with a spot, the premium saves as the field holds it', () => {
  assert.equal(premiumForSave({ spot: '30', premium: '4.50', premiumFromSpot: '4.50' }), 4.5);
  assert.equal(premiumForSave({ spot: '30', premium: '7', premiumFromSpot: '4.50' }), 7);
});

test('clearing the spot drops the premium worked out from it', () => {
  assert.equal(premiumForSave({ spot: '', premium: '4.50', premiumFromSpot: '4.50' }), 0);
  assert.equal(premiumForSave({ spot: '0', premium: '4.50', premiumFromSpot: '4.50' }), 0);
  assert.equal(premiumForSave({ spot: '.', premium: '4.50', premiumFromSpot: '4.50' }), 0);
});

test('with no spot, a premium the user typed is kept', () => {
  assert.equal(premiumForSave({ spot: '', premium: '6', premiumFromSpot: undefined }), 6);
  assert.equal(premiumForSave({ spot: '', premium: '6', premiumFromSpot: '4.50' }), 6);
});

test('an empty or unreadable premium saves as 0', () => {
  assert.equal(premiumForSave({ spot: '30', premium: '', premiumFromSpot: undefined }), 0);
  assert.equal(premiumForSave({ spot: '', premium: 'x', premiumFromSpot: undefined }), 0);
});

const app = readFileSync(new URL('../../App.js', import.meta.url), 'utf8');

test('savePurchase saves the spot and premium through the guard', () => {
  assert.match(app, /spotPrice: spotForSave\(form\.spotPrice\),/);
  assert.match(app, /premium: premiumForSave\(\{ spot: form\.spotPrice, premium: form\.premium, premiumFromSpot: form\.premiumFromSpot \}\),/);
});

test('the worked out premium is marked, and typing a premium clears the mark', () => {
  assert.match(app, /setForm\(prev => \(\{ \.\.\.prev, premium, premiumFromSpot: premium \}\)\)/);
  assert.match(app, /onChangeText=\{v => setForm\(p => \(\{ \.\.\.p, premium: v, premiumFromSpot: undefined \}\)\)\}/);
});
