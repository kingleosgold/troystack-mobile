// Guards the words iPhone shows in the widget gallery when someone adds a
// TroyStack widget. Feature copy carries no AI wording (the no-AI copy rule
// from #186, which keeps the disclosures) and the portfolio widget goes by the
// app's name, not the old Stack Tracker Gold. Builds compile targets/widget
// through @bacons/apple-targets, and plugins/ios-widget keeps a second copy,
// so both are read and must say the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const COPIES = [
  'targets/widget/StackTrackerWidget.swift',
  'plugins/ios-widget/widget-files/StackTrackerWidget.swift',
];

// Every .configurationDisplayName("...") and .description("...") string.
const galleryStrings = (src) => [...src.matchAll(/\.(configurationDisplayName|description)\("([^"]*)"\)/g)]
  .map(([, kind, text]) => ({ kind, text }));

for (const file of COPIES) {
  const strings = galleryStrings(readFileSync(path.join(root, file), 'utf8'));

  test(`${file} names both widgets for the gallery`, () => {
    assert.deepEqual(strings.filter((s) => s.kind === 'configurationDisplayName').map((s) => s.text), ['Ask Troy', 'TroyStack']);
    assert.equal(strings.filter((s) => s.kind === 'description').length, 2);
  });

  test(`${file} gallery copy says no AI and no old app name`, () => {
    for (const { text } of strings) {
      assert.doesNotMatch(text, /\bAI\b/, text);
      assert.doesNotMatch(text, /Stack Tracker/i, text);
    }
  });
}

test('both widget copies show the same gallery copy', () => {
  const [a, b] = COPIES.map((f) => galleryStrings(readFileSync(path.join(root, f), 'utf8')));
  assert.deepEqual(a, b);
});
