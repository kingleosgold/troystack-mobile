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

/**
 * The words after a price alert saves. Android can't get the push yet, so
 * there it says the alert is saved and can't reach the phone yet, instead
 * of promising a notification that never comes.
 */
export function alertCreatedMessage({ platform, metal, direction, targetPrice }) {
  const target = `${metal} goes ${direction} $${targetPrice.toFixed(2)}/oz`;
  if (platform === 'android') {
    return `Your alert for when ${target} is saved. Price alert notifications can't reach Android phones yet.`;
  }
  return `You'll be notified when ${target}.`;
}

/**
 * The red hint under Create Alert when there's no push token. On Android
 * turning notifications on can't help yet, so it says so and hides the
 * Enable Notifications button rather than send the person in a circle.
 */
export function pushHint({ platform }) {
  if (platform === 'android') {
    return {
      text: "Price alert notifications can't reach Android phones yet. Your alerts are still saved.",
      showEnableButton: false,
    };
  }
  return {
    text: 'Push notifications not enabled. Tap below to allow notifications.',
    showEnableButton: true,
  };
}
