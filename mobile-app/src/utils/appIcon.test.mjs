// Guards the coin icon set from 11/7. The App Store refuses an app icon with
// an alpha channel, the widget's AppIcon copies match the app's icon, the Ask
// Troy widget's TroyIcon is the transparent coin cutout (its circle clip would
// leave a dark ring around the square icon) and Android's adaptive background
// is the coin art's warm near black, 0E0C07.
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

// A tRNS chunk gives an RGB image transparency without an alpha channel.
function hasTrns(buf) {
  return buf.includes(Buffer.from('tRNS', 'latin1'));
}

const app = JSON.parse(read('app.json')).expo;

test('the app icon is an opaque 1024 square', () => {
  for (const p of [app.icon, './assets/icon-appstore.png']) {
    const buf = read(p);
    assert.deepEqual(pngHeader(buf), { width: 1024, height: 1024, colorType: 2 }, p);
    assert.equal(hasTrns(buf), false, p);
  }
});

test('the widget AppIcon copies are the app icon', () => {
  const sum = (p) => createHash('sha256').update(read(p)).digest('hex');
  const want = sum(app.icon);
  for (const p of ['icon.png', 'icon@2x.png', 'icon@3x.png']) {
    assert.equal(sum(`targets/widget/Assets.xcassets/AppIcon.imageset/${p}`), want, p);
  }
});

test('the Ask Troy widget icon is the transparent coin at 48pt', () => {
  for (const [p, size] of [['troy-icon.png', 48], ['troy-icon@2x.png', 96], ['troy-icon@3x.png', 144]]) {
    const head = pngHeader(read(`targets/widget/Assets.xcassets/TroyIcon.imageset/${p}`));
    assert.deepEqual(head, { width: size, height: size, colorType: 6 }, p);
  }
});

test('the Android adaptive icon is a transparent 1024 foreground on 0E0C07', () => {
  const fg = pngHeader(read(app.android.adaptiveIcon.foregroundImage));
  assert.deepEqual(fg, { width: 1024, height: 1024, colorType: 6 });
  assert.equal(app.android.adaptiveIcon.backgroundColor, '#0E0C07');
});

test('the splash sits on the app background', () => {
  assert.equal(app.splash.backgroundColor, '#0A0A0E');
  const buf = read(app.splash.image);
  const { width, height, colorType } = pngHeader(buf);
  assert.ok(width > 0 && height > 0);
  assert.equal(colorType, 2);
  assert.equal(hasTrns(buf), false);
});
