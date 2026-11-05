// Run with: node --test mobile-app/src/utils/alertButtons.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { fitAlertButtons } from './alertButtons.js';

const four = () => [
  { text: 'Take a Photo', onPress: () => {} },
  { text: 'Choose Photo', onPress: () => {} },
  { text: 'Import Spreadsheet', onPress: () => {} },
  { text: 'Cancel', style: 'cancel' },
];

test('iOS keeps all four buttons and the options as given', () => {
  const buttons = four();
  const out = fitAlertButtons(buttons, 'ios');
  assert.equal(out.buttons, buttons);
  assert.equal(out.options, undefined);
});

test('Android with three or fewer buttons is left alone', () => {
  const buttons = four().slice(1);
  const out = fitAlertButtons(buttons, 'android', { cancelable: false });
  assert.equal(out.buttons, buttons);
  assert.deepEqual(out.options, { cancelable: false });
});

test('Android with four buttons keeps the three actions and closes on a tap outside', () => {
  const out = fitAlertButtons(four(), 'android');
  assert.deepEqual(out.buttons.map((b) => b.text), ['Take a Photo', 'Choose Photo', 'Import Spreadsheet']);
  assert.equal(out.options.cancelable, true);
});

test('dismissing on Android runs the dropped Cancel handler and any onDismiss', () => {
  const calls = [];
  const buttons = four();
  buttons[3].onPress = () => calls.push('cancel');
  const out = fitAlertButtons(buttons, 'android', { onDismiss: () => calls.push('dismiss') });
  out.options.onDismiss();
  assert.deepEqual(calls, ['dismiss', 'cancel']);
});

test('a cancel button that is not last is still the one dropped', () => {
  const buttons = [{ text: 'Cancel', style: 'cancel' }, ...four().slice(0, 3)];
  const out = fitAlertButtons(buttons, 'android');
  assert.deepEqual(out.buttons.map((b) => b.text), ['Take a Photo', 'Choose Photo', 'Import Spreadsheet']);
});

test('bad input gives an empty list', () => {
  assert.deepEqual(fitAlertButtons(undefined, 'android').buttons, []);
});

test('dismissing on Android with no handlers anywhere does nothing and does not throw', () => {
  const out = fitAlertButtons(four(), 'android');
  assert.doesNotThrow(() => out.options.onDismiss());
});
