// Run with: node --test mobile-app/src/utils/startupImports.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../../App.js', import.meta.url), 'utf8');

test('metro loads modules on first use', () => {
  const metroConfig = readFileSync(new URL('../../metro.config.js', import.meta.url), 'utf8');
  assert.match(metroConfig, /inlineRequires: true/);
});

// Inline requires leave bare imports at the top of the module, so these still
// run at launch. The background task in particular has to be defined before
// iOS wakes the app to run it, and nothing else in App.js loads it at launch.
for (const mod of ['react-native-gesture-handler', 'react-native-url-polyfill/auto', './src/utils/backgroundTasks']) {
  test(`App.js imports ${mod} for its side effect`, () => {
    assert.ok(appSource.includes(`\nimport '${mod}';\n`), `missing bare import of ${mod}`);
  });
}

// Default and namespace imports load at launch even with inline requires, so
// these go through src/utils/lazyLoad.js and load on first use instead.
for (const mod of ['expo-image-picker', 'expo-file-system/legacy', 'expo-sharing', 'expo-document-picker', 'expo-store-review', 'react-native-view-shot', 'react-native-markdown-display', './src/screens/AuthScreen', './src/screens/AccountScreen', './src/screens/ResetPasswordScreen']) {
  test(`App.js loads ${mod} on first use`, () => {
    assert.ok(!appSource.includes(`from '${mod}';`), `${mod} is imported at launch`);
    assert.ok(appSource.includes(`require('${mod}')`), `${mod} has no first use require`);
  });
}
