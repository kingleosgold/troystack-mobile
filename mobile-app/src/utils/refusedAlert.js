/**
 * TroyStack - The words for holdings the database refused on a sync
 *
 * A refused holding stays on the phone only, so the alert names it, so the
 * user knows which one to check and save again. Up to three names are listed
 * and the rest are counted. Nothing here imports React Native, so it runs
 * under `node --test`.
 */

const LISTED = 3;

export function refusedHoldingsAlert(names) {
  const count = names.length;
  const labels = names.slice(0, LISTED).map((name) => (typeof name === 'string' && name.trim()) || 'A holding with no name');
  const more = count - labels.length;
  const list = labels.join(', ') + (more > 0 ? `, and ${more} more` : '');
  return {
    title: count === 1 ? "A holding didn't save to your account" : `${count} holdings didn't save to your account`,
    message: `${list}. ${count === 1 ? "It's" : "They're"} still on this phone. Check the numbers and save again, and the next sync sends ${count === 1 ? 'it' : 'them'} up.`,
  };
}
