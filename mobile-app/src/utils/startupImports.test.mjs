// Run with: node --test mobile-app/src/utils/startupImports.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../../App.js', import.meta.url), 'utf8');
const metroSource = readFileSync(new URL('../../metro.config.js', import.meta.url), 'utf8');

test('metro loads modules on first use', () => {
  assert.match(metroSource, /inlineRequires: true/);
});

// These have to run at launch. The background task in particular has to be
// defined before iOS wakes the app to run it. App.js imports each bare, and
// metro.config.js keeps each out of inline requires, since App.js also imports
// names from two of them and Metro would otherwise wait for a name's first use.
for (const mod of ['react-native-gesture-handler', 'react-native-url-polyfill/auto', './src/utils/backgroundTasks']) {
  test(`App.js imports ${mod} for its side effect`, () => {
    assert.ok(appSource.includes(`\nimport '${mod}';\n`), `missing bare import of ${mod}`);
  });
  test(`metro.config.js requires ${mod} at launch`, () => {
    assert.match(metroSource, /^const LAUNCH_REQUIRES = \[.*\];$/m);
    assert.ok(metroSource.match(/^const LAUNCH_REQUIRES = \[.*\];$/m)[0].includes(`'${mod}'`), `${mod} is inlined`);
  });
}

// CI runs these without npm install, so metro.config.js is read, not loaded.
test("metro.config.js keeps Metro's own list beside the launch modules", () => {
  assert.match(metroSource, /nonInlinedRequires: \[\.\.\.METRO_NON_INLINED, \.\.\.LAUNCH_REQUIRES\]/);
  const own = metroSource.match(/^const METRO_NON_INLINED = \[.*\];$/m)[0];
  for (const base of ['React', 'react', 'react/jsx-dev-runtime', 'react/jsx-runtime', 'react-compiler-runtime', 'react-native']) {
    assert.ok(own.includes(`'${base}'`), `${base} missing`);
  }
});

// Default and namespace imports load at launch even with inline requires, so
// these go through src/utils/lazyLoad.js and load on first use instead.
for (const mod of ['expo-image-picker', 'expo-file-system/legacy', 'expo-sharing', 'expo-document-picker', 'expo-store-review', 'react-native-view-shot', 'react-native-markdown-display', './src/screens/AuthScreen', './src/screens/AccountScreen', './src/screens/ResetPasswordScreen']) {
  test(`App.js loads ${mod} on first use`, () => {
    assert.ok(!appSource.includes(`from '${mod}';`), `${mod} is imported at launch`);
    assert.ok(appSource.includes(`require('${mod}')`), `${mod} has no first use require`);
  });
}
