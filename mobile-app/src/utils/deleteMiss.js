/**
 * TroyStack - A delete that didn't reach the account
 *
 * A signed-in delete takes the holding off the phone at once and then marks
 * its row deleted in the cloud. When that write fails, offline or refused,
 * the row is still live, so the next sync would bring the holding back with
 * no word why. Instead the holding goes back where it was right away and the
 * user is told the delete didn't happen. Nothing here imports React Native,
 * so it runs under `node --test`.
 */

// The list with the holding back at its old place, or as it is when a
// holding with that id is already there.
export function withHoldingRestored(items, item, index) {
  if (!item || items.some(i => i.id === item.id)) return items;
  const at = Number.isInteger(index) && index >= 0 ? Math.min(index, items.length) : items.length;
  return [...items.slice(0, at), item, ...items.slice(at)];
}

// A name as it reads in the sentence, with no closing stop and none past 40
// characters
function label(name) {
  const text = typeof name === 'string' ? name.trim().replace(/[.!?]+$/, '') : '';
  if (!text) return 'This holding';
  return text.length > 40 ? `${text.slice(0, 39).trimEnd()}…` : text;
}

export function deleteMissAlert(name) {
  return {
    title: "Couldn't delete",
    message: `${label(name)} is still in your account, so it's back in your stack. Check your connection and delete it again.`,
  };
}
