// Run with: node --test mobile-app/src/utils/sourceParses.test.mjs
// Most App.js tests read its source as text, so they pass on a file that
// doesn't parse, as a merge that declared syncSeqRef twice in AppContent did.
// This parses the app's own source the way Babel will when Metro bundles it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { parse } = require('@babel/parser');

const appDir = fileURLToPath(new URL('../../', import.meta.url));

const PLUGINS = {
  '.js': ['jsx'],
  '.mjs': [],
  '.ts': ['typescript'],
  '.tsx': ['typescript', 'jsx'],
};

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return PLUGINS[extname(entry.name)] ? [path] : [];
  });
}

function parseSource(code, ext) {
  return parse(code, { sourceType: 'module', plugins: PLUGINS[ext] });
}

const files = [join(appDir, 'App.js'), join(appDir, 'ErrorBoundary.js'), ...sourceFiles(join(appDir, 'src'))];

test('finds the app source', () => {
  assert.ok(files.length > 50, `only ${files.length} files`);
  assert.ok(files.some((f) => f.endsWith('.tsx')));
});

for (const file of files) {
  test(`${relative(appDir, file)} parses`, () => {
    parseSource(readFileSync(file, 'utf8'), extname(file));
  });
}

test('a name declared twice in one scope fails to parse', () => {
  assert.throws(
    () => parseSource('function AppContent() {\n  const syncSeqRef = 1;\n  const syncSeqRef = 2;\n}\n', '.js'),
    /already been declared/,
  );
});

test('a JSX tag left open fails to parse', () => {
  assert.throws(() => parseSource('const a = <View><Text>hi</View>;\n', '.js'));
});
