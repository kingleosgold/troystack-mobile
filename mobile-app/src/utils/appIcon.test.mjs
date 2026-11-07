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
// Walks the chunks so a stray match inside image data can't count.
function hasTrns(buf) {
  for (let at = 8; at + 8 <= buf.length; ) {
    const type = buf.subarray(at + 4, at + 8).toString('latin1');
    if (type === 'tRNS') return true;
    if (type === 'IDAT' || type === 'IEND') return false; // tRNS must come before IDAT
    at += 12 + buf.readUInt32BE(at);
  }
  return false;
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

// Sign in, the lock screen and the share card show the coin cutout, not the
// 1 MB opaque app icon with its square tile. 240 px covers 80pt at 3x.
test('in-app logos use the transparent coin cutout', () => {
  const buf = read('assets/troy-coin.png');
  assert.deepEqual(pngHeader(buf), { width: 240, height: 240, colorType: 6 });
  assert.ok(buf.length < 200 * 1024, `troy-coin.png is ${buf.length} bytes`);
  const auth = read('src/screens/AuthScreen.tsx').toString();
  assert.match(auth, /require\('\.\.\/\.\.\/assets\/troy-coin\.png'\)/);
  assert.doesNotMatch(auth, /assets\/icon\.png/);
  const appJs = read('App.js').toString();
  assert.equal((appJs.match(/<Image source=\{require\('\.\/assets\/troy-coin\.png'\)\}/g) || []).length, 2);
  // The only icon.png left in App.js is Troy's audio artwork, where iOS wants a square.
  assert.equal((appJs.match(/assets\/icon\.png/g) || []).length, 1);
  assert.match(appJs, /artwork: Image\.resolveAssetSource\(require\('\.\/assets\/icon\.png'\)\)/);
});
