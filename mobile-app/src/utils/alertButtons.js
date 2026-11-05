/**
 * TroyStack - Fit an alert's buttons to Android's three
 *
 * Android's native alert shows at most three buttons and keeps the first
 * three it's given, so a fourth Cancel button disappears and the alert
 * can't be closed without picking something. When an alert has more than
 * three buttons on Android, this drops the Cancel button and makes the
 * alert close on a tap outside or the back button instead. iOS keeps
 * every button.
 */

const ANDROID_MAX_BUTTONS = 3;

export function fitAlertButtons(buttons, platformOS, options) {
  const list = Array.isArray(buttons) ? buttons : [];
  if (platformOS !== 'android' || list.length <= ANDROID_MAX_BUTTONS) {
    return { buttons: list, options };
  }
  const cancel = list.find((b) => b && b.style === 'cancel');
  const actions = list.filter((b) => b !== cancel);
  return {
    buttons: actions,
    options: {
      ...options,
      cancelable: true,
      onDismiss: () => {
        if (options && typeof options.onDismiss === 'function') options.onDismiss();
        if (cancel && typeof cancel.onPress === 'function') cancel.onPress();
      },
    },
  };
}
