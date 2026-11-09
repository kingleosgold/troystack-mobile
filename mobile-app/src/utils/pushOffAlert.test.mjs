// Run with: node --test mobile-app/src/utils/pushOffAlert.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pushOffAlert, SETTINGS_NAME } from './pushOffAlert.js';

const here = new URL('.', import.meta.url);
const appJson = JSON.parse(readFileSync(new URL('../../app.json', here), 'utf8'));
const appJs = readFileSync(new URL('../../App.js', here), 'utf8');

test('a refused permission on iPhone names the app as Settings lists it', () => {
  const { title, message, openSettings } = pushOffAlert({ platform: 'ios', granted: false });
  assert.equal(title, 'Notifications are off');
  assert.equal(message, 'Open Settings, tap Troy and turn on notifications.');
  assert.equal(openSettings, true);
});

test('a refused permission on Android never mentions iOS', () => {
  const { message, openSettings } = pushOffAlert({ platform: 'android', granted: false });
  assert.equal(message, 'Open Settings, find TroyStack in Apps and turn on notifications.');
  assert.doesNotMatch(message, /iOS|iPhone/);
  assert.equal(openSettings, true);
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

test('the names match the ones app.json gives each phone', () => {
  assert.equal(SETTINGS_NAME.ios, appJson.expo.ios.infoPlist.CFBundleDisplayName);
  assert.equal(SETTINGS_NAME.android, appJson.expo.name);
});

test('App.js no longer tells anyone to use the iOS Settings app for Stack Tracker', () => {
  assert.doesNotMatch(appJs, /Stack Tracker in your iOS Settings/);
  assert.match(appJs, /pushOffAlert\(/);
});
