// Run with: node --test mobile-app/src/utils/scanNotice.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { SCAN_AI_NOTE, SCAN_SOURCE_MESSAGE, scanPickerButtons } from './scanNotice.js';

test('the scan note names a third-party AI service and that the photo is not kept', () => {
  assert.match(SCAN_AI_NOTE, /third-party AI service/);
  assert.match(SCAN_AI_NOTE, /doesn't keep it/);
});

test('the source picker message carries the note after the prompt', () => {
  assert.ok(SCAN_SOURCE_MESSAGE.startsWith('Choose a source.'));
  assert.ok(SCAN_SOURCE_MESSAGE.endsWith(SCAN_AI_NOTE));
});

test('no em or en dashes in the copy', () => {
  for (const s of [SCAN_AI_NOTE, SCAN_SOURCE_MESSAGE]) {
    assert.ok(!/[–—]/.test(s));
  }
});

test("the widget's scan link offers camera and library with the note before either opens", async () => {
  const { readFile } = await import('node:fs/promises');
  const app = await readFile(new URL('../../App.js', import.meta.url), 'utf8');
  const start = app.indexOf("url.includes('troystack://scan')");
  assert.ok(start > -1);
  // The block runs to the return after the note; the earlier return only
  // drops a repeat delivery of the same tap.
  const block = app.slice(start, app.indexOf('return;', app.indexOf('SCAN_SOURCE_MESSAGE', start)));
  assert.ok(block.indexOf('SCAN_SOURCE_MESSAGE') > -1, 'the scan link block names SCAN_SOURCE_MESSAGE');
  // The only scan call is the one scanPickerButtons runs from a button's onPress.
  const scans = block.match(/performScan(Ref\.current\?\.)?\(/g) || [];
  assert.equal(scans.length, 1);
  assert.match(block, /scanPickerButtons\(\(source\) => performScanRef\.current\?\.\(source\)\)/, 'both sources go through the shared buttons');
  assert.match(block, /Alert\.alert\('Scan Receipt', SCAN_SOURCE_MESSAGE, scanPicker\.buttons, scanPicker\.options\)/, 'the note shows in the alert that holds the buttons');
});

test('the scan picker buttons are Take Photo, Choose from Library and Cancel, and scan only on a tap', () => {
  const calls = [];
  const buttons = scanPickerButtons((source) => calls.push(source));
  assert.deepEqual(buttons.map((b) => b.text), ['Take Photo', 'Choose from Library', 'Cancel']);
  assert.deepEqual(calls, []);
  assert.equal(buttons[2].style, 'cancel');
  assert.equal(buttons[2].onPress, undefined);
  buttons[0].onPress();
  buttons[1].onPress();
  assert.deepEqual(calls, ['camera', 'gallery']);
});

test('every Scan Receipt picker uses the shared buttons and the source message', async () => {
  const { readFile } = await import('node:fs/promises');
  const app = await readFile(new URL('../../App.js', import.meta.url), 'utf8');
  assert.equal((app.match(/fitAlertButtons\(\s*scanPickerButtons\(/g) || []).length, 4);
  assert.equal((app.match(/Alert\.alert\('Scan Receipt', SCAN_SOURCE_MESSAGE, scanPicker\.buttons, scanPicker\.options\)/g) || []).length, 4);
  assert.ok(!/\{ text: 'Take Photo'/.test(app), 'no picker writes its buttons out by hand');
});

test("the widget's scan link runs the current render's scan, not the first one", async () => {
  const { readFile } = await import('node:fs/promises');
  const app = await readFile(new URL('../../App.js', import.meta.url), 'utf8');
  const start = app.indexOf("url.includes('troystack://scan')");
  const block = app.slice(start, app.indexOf('return;', app.indexOf('SCAN_SOURCE_MESSAGE', start)));
  // The deep link effect runs once, so a bare performScan there would keep the
  // first render's Gold status, scan count and user id.
  assert.ok(!/[^.\w]performScan\(/.test(block), 'the link calls performScan through the ref');
  const def = app.indexOf('  const performScan = async (source) => {');
  assert.ok(def > -1);
  const end = app.indexOf('\n  };\n', def) + '\n  };\n'.length;
  assert.equal(app.slice(end, end + 40), '  performScanRef.current = performScan;\n');
  assert.match(app, /const performScanRef = useRef\(null\);/);
});

test("one widget tap delivered twice shows one scan note", async () => {
  const { readFile } = await import('node:fs/promises');
  const app = await readFile(new URL('../../App.js', import.meta.url), 'utf8');
  const start = app.indexOf("url.includes('troystack://scan')");
  const block = app.slice(start, app.indexOf('Alert.alert(', start));
  assert.match(block, /now - lastScanLinkAtRef\.current < 2000\) return;/);
  assert.ok(block.indexOf('lastScanLinkAtRef.current = now') < block.indexOf('setTimeout('));
});
