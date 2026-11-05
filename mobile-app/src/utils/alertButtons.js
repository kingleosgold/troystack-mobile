/**
 * TroyStack - Fit an alert's buttons to Android's three
 *
 * Android's native alert shows at most three buttons and keeps the first
 * three it's given, so a fourth Cancel button disappears and the alert
 * can't be closed without picking something. When an alert has more than
 * three buttons on Android, this drops every Cancel-style button and makes
 * the alert close on a tap outside or the back button instead, so it always
 * sets cancelable: true there. iOS keeps every button.
 *
 * React Native gives Android's positive slot (the rightmost, main button)
 * to the last button in the list. Callers list the main action first, the
 * way iOS shows it at the top, so on Android the kept actions are reversed
 * and the first one listed lands in the main spot.
 */

const ANDROID_MAX_BUTTONS = 3;

export function fitAlertButtons(buttons, platformOS, options) {
  const list = Array.isArray(buttons) ? buttons : [];
  if (platformOS !== 'android' || list.length <= ANDROID_MAX_BUTTONS) {
    return { buttons: list, options };
  }
  const cancels = list.filter((b) => b && b.style === 'cancel');
  const actions = list.filter((b) => !(b && b.style === 'cancel'));
  if (actions.length > ANDROID_MAX_BUTTONS && typeof __DEV__ !== 'undefined' && __DEV__) {
    console.warn(`[alertButtons] Android shows three buttons, dropping ${actions.length - ANDROID_MAX_BUTTONS} action(s)`);
  }
  return {
    buttons: actions.slice(0, ANDROID_MAX_BUTTONS).reverse(),
    options: {
      ...options,
      cancelable: true,
      onDismiss: () => {
        if (options && typeof options.onDismiss === 'function') options.onDismiss();
        const cancel = cancels[0];
        if (cancel && typeof cancel.onPress === 'function') cancel.onPress();
      },
    },
  };
}
