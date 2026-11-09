/**
 * TroyStack - The words when Enable Notifications doesn't get a push token
 *
 * Two different things can stop it. The person said no to notifications,
 * and the alert's Open Settings button takes them to the app's own page in
 * Settings on both phones, where the words name the Notifications row. Or
 * permission is on and the token still didn't come, so sending them to
 * Settings would only send them in a circle. Android builds don't carry
 * Firebase yet, so there it always means push can't reach the phone and
 * "try again later" would never come true. Once Firebase is in, the Android
 * branch goes back to the shared words (a test fails until it does).
 * Nothing here imports React Native, so it runs under `node --test`.
 */

export function pushOffAlert({ platform, granted }) {
  if (granted && platform === 'android') {
    return {
      title: "Notifications aren't on Android yet",
      message: "Price alert notifications can't reach Android phones yet. Your alerts are still saved.",
      openSettings: false,
    };
  }
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
