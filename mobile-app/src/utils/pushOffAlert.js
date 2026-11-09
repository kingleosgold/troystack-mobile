/**
 * TroyStack - The words when Enable Notifications doesn't get a push token
 *
 * Two different things can stop it. The person said no to notifications, so
 * the alert sends them to Settings and names the app the way Settings lists
 * it. Or permission is on and the token still didn't come, which Android does
 * until the app carries Firebase, so sending them to Settings would only send
 * them in a circle. Nothing here imports React Native, so it runs under
 * `node --test`.
 */

// The name each phone shows under the icon and in its Settings list. iOS uses
// CFBundleDisplayName from app.json, Android uses the app's name.
export const SETTINGS_NAME = { ios: 'Troy', android: 'TroyStack' };

export function pushOffAlert({ platform, granted }) {
  if (granted) {
    return {
      title: "Notifications didn't turn on",
      message: "Something went wrong on our side. Please try again later.",
      openSettings: false,
    };
  }
  const name = SETTINGS_NAME[platform] || 'TroyStack';
  return {
    title: 'Notifications are off',
    message: platform === 'android'
      ? `Open Settings, find ${name} in Apps and turn on notifications.`
      : `Open Settings, tap ${name} and turn on notifications.`,
    openSettings: true,
  };
}
