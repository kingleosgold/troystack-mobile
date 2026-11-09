// Run with: node --test mobile-app/src/utils/pushOffAlert.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pushOffAlert } from './pushOffAlert.js';

const here = new URL('.', import.meta.url);
const appJs = readFileSync(new URL('../../App.js', here), 'utf8');

test('a refused permission points at the Notifications row the button opens to', () => {
  for (const platform of ['ios', 'android']) {
    const { title, message, openSettings } = pushOffAlert({ platform, granted: false });
    assert.equal(title, 'Notifications are off');
    assert.equal(message, 'Tap Open Settings, then Notifications, and turn them on.');
    assert.doesNotMatch(message, /iOS|iPhone|Android| in Apps/);
    assert.equal(openSettings, true);
  }
});

test("the copy's button name matches the alert's button in App.js", () => {
  assert.match(appJs, /text: 'Open Settings', onPress: \(\) => Linking\.openSettings\(\)/);
});

test('a granted permission with no token never sends the person to Settings', () => {
  for (const platform of ['ios', 'android']) {
    const { message, openSettings } = pushOffAlert({ platform, granted: true });
    assert.equal(openSettings, false);
    assert.doesNotMatch(message, /Settings/);
  }
});

test('no copy uses the old name or an em dash', () => {
  for (const platform of ['ios', 'android', 'web']) {
    for (const granted of [true, false]) {
      const { title, message } = pushOffAlert({ platform, granted });
      assert.doesNotMatch(`${title} ${message}`, /Stack Tracker|—/);
    }
  }
});

test('App.js no longer tells anyone to use the iOS Settings app for Stack Tracker', () => {
  assert.doesNotMatch(appJs, /Stack Tracker in your iOS Settings/);
  assert.match(appJs, /pushOffAlert\(/);
});
