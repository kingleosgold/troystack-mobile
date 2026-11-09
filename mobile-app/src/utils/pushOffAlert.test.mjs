// Run with: node --test mobile-app/src/utils/pushOffAlert.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pushOffAlert, alertCreatedMessage, pushHint } from './pushOffAlert.js';

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

test('Alert Created on iPhone keeps the notified when words', () => {
  const msg = alertCreatedMessage({ platform: 'ios', metal: 'silver', direction: 'above', targetPrice: 80 });
  assert.equal(msg, "You'll be notified when silver goes above $80.00/oz.");
});

test("Alert Created on Android says the alert is saved and push can't reach it yet", () => {
  const msg = alertCreatedMessage({ platform: 'android', metal: 'gold', direction: 'below', targetPrice: 4500.5 });
  assert.equal(msg, "Alert saved for when gold goes below $4500.50/oz. Price alert notifications can't reach Android phones yet.");
  assert.doesNotMatch(msg, /You'll be notified/);
});

test('the hint on iPhone keeps the Enable Notifications button', () => {
  const { text, showEnableButton } = pushHint({ platform: 'ios' });
  assert.equal(text, 'Push notifications not enabled. Tap below to allow notifications.');
  assert.equal(showEnableButton, true);
});

test("the hint on Android uses the #219 words and hides the button that can't help", () => {
  const { text, showEnableButton } = pushHint({ platform: 'android' });
  assert.equal(text, pushOffAlert({ platform: 'android', granted: true }).message);
  assert.equal(showEnableButton, false);
});

test('App.js passes the platform to the Alert Created and hint words', () => {
  assert.match(appJs, /alertCreatedMessage\(\{ platform: Platform\.OS,/);
  assert.match(appJs, /pushHint\(\{ platform: Platform\.OS \}\)\.text/);
  assert.match(appJs, /pushHint\(\{ platform: Platform\.OS \}\)\.showEnableButton && \(/);
  assert.doesNotMatch(appJs, /`You'll be notified when/);
});

test('no Alert Created or hint copy uses the old name or an em dash', () => {
  for (const platform of ['ios', 'android', 'web']) {
    const msg = alertCreatedMessage({ platform, metal: 'platinum', direction: 'above', targetPrice: 1 });
    assert.doesNotMatch(`${msg} ${pushHint({ platform }).text}`, /Stack Tracker|—/);
  }
});
