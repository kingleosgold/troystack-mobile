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
  const block = app.slice(start, app.indexOf('return;', start));
  const note = block.indexOf('SCAN_AI_NOTE');
  const camera = block.indexOf("performScan('camera')");
  assert.ok(note > -1, 'the scan link block names SCAN_AI_NOTE');
  assert.ok(!/performScan\(/.test(block.slice(0, note)), 'nothing scans before the note');
  assert.ok(camera > note, 'the camera opens only from a button after the note');
  assert.ok(/Alert\.alert\(/.test(block.slice(0, camera)), 'the note shows in an alert first');
  assert.match(block, /style: 'cancel'/);
});
