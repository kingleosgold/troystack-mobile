// Run with: node --test mobile-app/src/utils/scanNotice.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { SCAN_AI_NOTE, SCAN_SOURCE_MESSAGE } from './scanNotice.js';

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

test("the widget's scan link shows the note before the camera opens", async () => {
  const { readFile } = await import('node:fs/promises');
  const app = await readFile(new URL('../../App.js', import.meta.url), 'utf8');
  const start = app.indexOf("url.includes('troystack://scan')");
  assert.ok(start > -1);
  // The block runs to the return after the note; the earlier return only
  // drops a repeat delivery of the same tap.
  const block = app.slice(start, app.indexOf('return;', app.indexOf('SCAN_AI_NOTE', start)));
  const note = block.indexOf('SCAN_AI_NOTE');
  assert.ok(note > -1, 'the scan link block names SCAN_AI_NOTE');
  // Every scan call is a button's onPress, so nothing scans until a tap on the note's alert.
  const scans = block.match(/performScan(Ref\.current\?\.)?\(/g) || [];
  const buttonScans = block.match(/onPress: \(\) => performScanRef\.current\?\.\('camera'\)/g) || [];
  assert.equal(scans.length, 1);
  assert.equal(buttonScans.length, 1, 'the camera opens only from a button');
  assert.match(block, /Alert\.alert\('Scan Receipt', SCAN_AI_NOTE, scanPicker\.buttons, scanPicker\.options\)/, 'the note shows in the alert that holds the button');
  assert.match(block, /style: 'cancel'/);
});

test("the widget's scan link runs the current render's scan, not the first one", async () => {
  const { readFile } = await import('node:fs/promises');
  const app = await readFile(new URL('../../App.js', import.meta.url), 'utf8');
  const start = app.indexOf("url.includes('troystack://scan')");
  const block = app.slice(start, app.indexOf('return;', app.indexOf('SCAN_AI_NOTE', start)));
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
