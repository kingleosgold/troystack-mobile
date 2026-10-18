// Inline requires load a module the first time its code runs instead of at
// launch, so the 16,000 line App.js no longer pulls every screen's libraries
// (charts, markdown, receipt scanning, audio) into the cold start. React
// Native's own guide on JavaScript loading recommends it. Modules whose import
// has to run at launch for its side effect are imported bare at the top of
// App.js, which inline requires leave in place.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: true,
    inlineRequires: true,
  },
});

module.exports = config;
