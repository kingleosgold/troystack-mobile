// Inline requires load a module the first time its code runs instead of at
// launch, so the 16,000 line App.js no longer pulls every screen's libraries
// (charts, markdown, receipt scanning, audio) into the cold start. React
// Native's own guide on JavaScript loading recommends it. Modules whose import
// has to run at launch for its side effect are imported bare at the top of
// App.js and listed in LAUNCH_REQUIRES. A bare import alone isn't enough when
// App.js also imports names from the same module, since Metro merges the two
// and the require then waits for the first use of a name.
const { getDefaultConfig } = require('expo/metro-config');

// Metro's own list, which setting nonInlinedRequires replaces.
const METRO_NON_INLINED = ['React', 'react', 'react/jsx-dev-runtime', 'react/jsx-runtime', 'react-compiler-runtime', 'react-native'];

// Required at the top of App.js at launch: the gesture handler sets itself up,
// the URL polyfill fills in globals before any fetch builds a URL, and the
// background task has to be defined before iOS wakes the app to run it.
const LAUNCH_REQUIRES = ['react-native-gesture-handler', 'react-native-url-polyfill/auto', './src/utils/backgroundTasks'];

const config = getDefaultConfig(__dirname);

config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: true,
    inlineRequires: true,
    nonInlinedRequires: [...METRO_NON_INLINED, ...LAUNCH_REQUIRES],
  },
});

module.exports = config;
