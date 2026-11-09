/**
 * TroyStack - The words when Enable Notifications doesn't get a push token
 *
 * Two different things can stop it. The person said no to notifications,
 * and the alert's Open Settings button takes them to the app's own page in
 * Settings on both phones, where the words name the Notifications row. Or
 * permission is on and the token still didn't come, which Android does until
 * the app carries Firebase, so sending them to Settings would only send them
 * in a circle. Nothing here imports React Native, so it runs under
 * `node --test`.
 */

export function pushOffAlert({ platform, granted }) {
  if (granted) {
    return {
      title: "Notifications didn't turn on",
      message: "Something went wrong on our side. Please try again later.",
      openSettings: false,
    };
  }
  return {
    title: 'Notifications are off',
    message: 'Tap Open Settings, then Notifications, and turn them on.',
    openSettings: true,
  };
}
