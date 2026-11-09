// Run with: node --test mobile-app/src/utils/pushOffAlert.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pushOffAlert } from './pushOffAlert.js';

const here = new URL('.', import.meta.url);
const appJs = readFileSync(new URL('../../App.js', here), 'utf8');
const appJson = JSON.parse(readFileSync(new URL('../../app.json', here), 'utf8'));

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

test("Android with permission on says push can't reach it yet, not try again later", () => {
  const { title, message, openSettings } = pushOffAlert({ platform: 'android', granted: true });
  assert.equal(title, "Notifications aren't on Android yet");
  assert.equal(message, "Price alert notifications can't reach Android phones yet. Your alerts are still saved.");
  assert.doesNotMatch(message, /try again/i);
  assert.equal(openSettings, false);
});

test('the Android words hold only while Android builds lack Firebase', () => {
  // Adding google-services.json makes Android push work, so the Android
  // branch in pushOffAlert has to go when this fails.
  assert.equal(appJson.expo?.android?.googleServicesFile, undefined);
});

test('App.js passes the platform the Android words depend on', () => {
  assert.match(appJs, /pushOffAlert\(\{ platform: Platform\.OS, granted \}\)/);
});

test('iPhone with permission on keeps the try again later words', () => {
  const { title, message } = pushOffAlert({ platform: 'ios', granted: true });
  assert.equal(title, "Notifications didn't turn on");
  assert.match(message, /try again later/);
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
