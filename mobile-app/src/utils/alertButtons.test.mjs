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

test('Android with three or fewer buttons and no Cancel is left alone', () => {
  const buttons = four().slice(0, 3);
  const out = fitAlertButtons(buttons, 'android', { cancelable: false });
  assert.equal(out.buttons, buttons);
  assert.deepEqual(out.options, { cancelable: false });
});

test('Android with four buttons keeps the three actions, main one last, and closes on a tap outside', () => {
  const out = fitAlertButtons(four(), 'android');
  // React Native puts the last button in Android's positive (main) slot.
  assert.deepEqual(out.buttons.map((b) => b.text), ['Import Spreadsheet', 'Choose Photo', 'Take a Photo']);
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
  assert.deepEqual(out.buttons.map((b) => b.text), ['Import Spreadsheet', 'Choose Photo', 'Take a Photo']);
});

test('every cancel-style button drops on Android and the first one runs on dismiss', () => {
  const calls = [];
  const buttons = [
    ...four().slice(0, 3),
    { text: 'Not now', style: 'cancel', onPress: () => calls.push('not now') },
    { text: 'Cancel', style: 'cancel', onPress: () => calls.push('cancel') },
  ];
  const out = fitAlertButtons(buttons, 'android');
  assert.deepEqual(out.buttons.map((b) => b.text), ['Import Spreadsheet', 'Choose Photo', 'Take a Photo']);
  out.options.onDismiss();
  assert.deepEqual(calls, ['not now']);
});

test('more than three actions on Android keeps the first three listed, main one last', () => {
  const buttons = [...four().slice(0, 3), { text: 'Type It In', onPress: () => {} }, { text: 'Cancel', style: 'cancel' }];
  const out = fitAlertButtons(buttons, 'android');
  assert.deepEqual(out.buttons.map((b) => b.text), ['Import Spreadsheet', 'Choose Photo', 'Take a Photo']);
});

test('the kept actions keep their handlers and styles and the input is not changed', () => {
  const buttons = four();
  buttons[0].style = 'default';
  const before = buttons.map((b) => b.text);
  const out = fitAlertButtons(buttons, 'android');
  assert.equal(out.buttons[2], buttons[0]);
  assert.equal(out.buttons[0], buttons[2]);
  assert.deepEqual(buttons.map((b) => b.text), before);
});

test('bad input gives an empty list', () => {
  assert.deepEqual(fitAlertButtons(undefined, 'android').buttons, []);
});

test('dismissing on Android with no handlers anywhere does nothing and does not throw', () => {
  const out = fitAlertButtons(four(), 'android');
  assert.doesNotThrow(() => out.options.onDismiss());
});

const scanPicker = () => [
  { text: 'Take Photo', onPress: () => {} },
  { text: 'Choose from Library', onPress: () => {} },
  { text: 'Cancel', style: 'cancel' },
];

test('Android scan picker puts Take Photo in the positive slot and Cancel in the negative slot', () => {
  const opts = { cancelable: false };
  const out = fitAlertButtons(scanPicker(), 'android', opts);
  // React Native maps the list to neutral, negative, positive from first to last.
  assert.deepEqual(out.buttons.map((b) => b.text), ['Choose from Library', 'Cancel', 'Take Photo']);
  assert.equal(out.options, opts);
});

test('Android scan picker closes on back or a tap outside and runs Cancel and onDismiss', () => {
  const calls = [];
  const buttons = scanPicker();
  buttons[2].onPress = () => calls.push('cancel');
  const out = fitAlertButtons(buttons, 'android', { onDismiss: () => calls.push('dismiss') });
  assert.equal(out.options.cancelable, true);
  out.options.onDismiss();
  assert.deepEqual(calls, ['dismiss', 'cancel']);
});

test('Android scan picker with no options and no handlers still closes and does not throw', () => {
  const out = fitAlertButtons(scanPicker(), 'android');
  assert.equal(out.options.cancelable, true);
  assert.doesNotThrow(() => out.options.onDismiss());
});

test('Android lists left as given keep their options untouched', () => {
  const opts = { cancelable: false };
  const noCancel = scanPicker().slice(0, 2);
  assert.equal(fitAlertButtons(noCancel, 'android', opts).options, opts);
  assert.equal(fitAlertButtons(noCancel, 'android').options, undefined);
});

test('Android two-button alert puts Cancel first so the action is the positive button', () => {
  const out = fitAlertButtons(scanPicker().filter((b) => b.text !== 'Choose from Library'), 'android');
  assert.deepEqual(out.buttons.map((b) => b.text), ['Cancel', 'Take Photo']);
});

test('Android keeps the onPress handlers on reordered buttons', () => {
  const calls = [];
  const buttons = scanPicker();
  buttons[0].onPress = () => calls.push('camera');
  const out = fitAlertButtons(buttons, 'android');
  out.buttons[2].onPress();
  assert.deepEqual(calls, ['camera']);
});

test('Android lists without exactly one Cancel, or with a null entry, stay as given', () => {
  const noCancel = scanPicker().slice(0, 2);
  assert.equal(fitAlertButtons(noCancel, 'android').buttons, noCancel);
  const twoCancels = [{ text: 'A', onPress: () => {} }, { text: 'No', style: 'cancel' }, { text: 'Cancel', style: 'cancel' }];
  assert.equal(fitAlertButtons(twoCancels, 'android').buttons, twoCancels);
  const onlyCancel = [{ text: 'Cancel', style: 'cancel' }];
  assert.equal(fitAlertButtons(onlyCancel, 'android').buttons, onlyCancel);
  const withNull = [null, { text: 'Take Photo', onPress: () => {} }, { text: 'Cancel', style: 'cancel' }];
  assert.equal(fitAlertButtons(withNull, 'android').buttons, withNull);
});

test('iOS scan picker keeps its order', () => {
  const buttons = scanPicker();
  assert.equal(fitAlertButtons(buttons, 'ios').buttons, buttons);
});

test('every Scan Receipt picker in App.js goes through fitAlertButtons', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../App.js', import.meta.url), 'utf8');
  assert.equal((src.match(/Alert\.alert\('Scan Receipt', SCAN_[A-Z_]+, \[/g) || []).length, 0);
  assert.equal((src.match(/Alert\.alert\('Scan Receipt', SCAN_[A-Z_]+, scanPicker\.buttons, scanPicker\.options\)/g) || []).length, 4);
});
