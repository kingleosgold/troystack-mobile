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
