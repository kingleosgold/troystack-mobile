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
 * to the last button in the list, the negative slot to the one before it
 * and the neutral slot (far left) to the one before that. Callers list the
 * main action first, the way iOS shows it at the top, so on Android the kept
 * actions are reversed and the first one listed lands in the main spot.
 *
 * With three or fewer buttons and one Cancel-style button, Android gets the
 * main action in the positive slot and Cancel in the negative slot, so Cancel
 * isn't the highlighted button. Any other action takes the neutral slot.
 * Lists without exactly one Cancel are left as given.
 */

const ANDROID_MAX_BUTTONS = 3;

export function fitAlertButtons(buttons, platformOS, options) {
  const list = Array.isArray(buttons) ? buttons : [];
  if (platformOS !== 'android') {
    return { buttons: list, options };
  }
  if (list.length <= ANDROID_MAX_BUTTONS) {
    const cancels = list.filter((b) => b && b.style === 'cancel');
    const actions = list.filter((b) => b && b.style !== 'cancel');
    if (cancels.length !== 1 || actions.length === 0 || actions.length + 1 !== list.length) {
      return { buttons: list, options };
    }
    const [main, ...rest] = actions;
    return { buttons: [...rest.reverse(), cancels[0], main], options };
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
