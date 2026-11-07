// Guards the coin icon set from 11/7. The App Store refuses an app icon with
// an alpha channel, the widget's AppIcon and TroyIcon copies should match the
// app's icon, and Android's adaptive background is the coin art's warm near
// black, 0E0C07.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => readFileSync(path.join(root, p));

// Width, height and PNG color type from the IHDR chunk. Color type 2 is RGB
// with no alpha, 6 is RGBA.
function pngHeader(buf) {
  assert.equal(buf.subarray(1, 4).toString('latin1'), 'PNG');
  assert.equal(buf.subarray(12, 16).toString('latin1'), 'IHDR');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colorType: buf[25] };
}

const app = JSON.parse(read('app.json')).expo;

test('the app icon is an opaque 1024 square', () => {
  for (const p of [app.icon, './assets/icon-appstore.png']) {
    assert.deepEqual(pngHeader(read(p)), { width: 1024, height: 1024, colorType: 2 }, p);
  }
});

test('the widget icons are the app icon', () => {
  const sum = (p) => createHash('sha256').update(read(p)).digest('hex');
  const want = sum(app.icon);
  for (const p of [
    'AppIcon.imageset/icon.png',
    'AppIcon.imageset/icon@2x.png',
    'AppIcon.imageset/icon@3x.png',
    'TroyIcon.imageset/troy-icon.png',
    'TroyIcon.imageset/troy-icon@2x.png',
    'TroyIcon.imageset/troy-icon@3x.png',
  ]) {
    assert.equal(sum(`targets/widget/Assets.xcassets/${p}`), want, p);
  }
});

test('the Android adaptive icon is a transparent 1024 foreground on 0E0C07', () => {
  const fg = pngHeader(read(app.android.adaptiveIcon.foregroundImage));
  assert.deepEqual(fg, { width: 1024, height: 1024, colorType: 6 });
  assert.equal(app.android.adaptiveIcon.backgroundColor, '#0E0C07');
});

test('the splash sits on the app background', () => {
  assert.equal(app.splash.backgroundColor, '#0A0A0E');
  const { width, height } = pngHeader(read(app.splash.image));
  assert.ok(width > 0 && height > 0);
});
