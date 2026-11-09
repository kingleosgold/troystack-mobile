/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: "widget",

  // Name of the widget target
  name: "StackTrackerWidget",

  // Display name shown to users
  displayName: "TroyStack",

  // Widget accent color (gold)
  colors: {
    $accent: { color: "#fbbf24", darkColor: "#fbbf24" },
    WidgetBackground: { color: "#0A0A0E", darkColor: "#0A0A0E" },
  },

  // Frameworks required for the widget
  frameworks: ["SwiftUI", "WidgetKit"],

  // Note: App Group entitlements are in StackTrackerWidget.entitlements file
  // Using explicit file to ensure exact match with provisioning profile

  // iOS deployment target
  deploymentTarget: "17.0",

  // Bundle identifier (appended to main app's bundle ID)
  bundleIdentifier: ".widget",
};
