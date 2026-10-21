/**
 * TroyStack - The words for holdings the database refused on a sync
 *
 * A refused holding stays on the phone only, so the alert names it, so the
 * user knows which one to check and save again. Up to three names are listed
 * and the rest are counted. Nothing here imports React Native, so it runs
 * under `node --test`.
 */

const LISTED = 3;

// A name as it reads in a list, with no closing stop and none past 40
// characters, so the sentence after it stays readable
function label(name, first) {
  const text = typeof name === 'string' ? name.trim().replace(/[.!?]+$/, '') : '';
  if (!text) return first ? 'A holding with no name' : 'a holding with no name';
  return text.length > 40 ? `${text.slice(0, 39).trimEnd()}…` : text;
}

export function refusedHoldingsAlert(names) {
  const count = names.length;
  const labels = names.slice(0, LISTED).map((name, i) => label(name, i === 0));
  const more = count - labels.length;
  if (more > 0) labels.push(`${more} more`);
  const list = labels.length <= 2 ? labels.join(' and ') : `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
  return {
    title: count === 1 ? "A holding didn't save to your account" : `${count} holdings didn't save to your account`,
    message: `${list}. ${count === 1 ? "It's" : "They're"} still on this phone. Check the numbers and save again, and the next sync sends ${count === 1 ? 'it' : 'them'} up.`,
  };
}
