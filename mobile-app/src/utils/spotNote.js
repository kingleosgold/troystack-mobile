// What the Dashboard says about its spot prices before a live fetch lands.
// The app opens on placeholder spot prices, or on the ones saved by the last
// fetch, and a new install with no network would otherwise value a stack at
// those numbers under a "Live Spot" header. Until a fetch this session comes
// back, the header drops "Live" and a note says where the prices came from.
// Nothing here imports React Native, so it runs under `node --test`.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// The spot grid's header.
export const spotHeader = (live) => (live ? 'Live Spot' : 'Spot');

// A time as "3:40 PM" in the phone's own time zone.
const clock = (date) => {
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours % 12 === 0 ? 12 : hours % 12}:${minutes} ${hours < 12 ? 'AM' : 'PM'}`;
};

// When saved prices were fetched, as "today at 3:40 PM" or "Nov 1 at 3:40 PM".
// A different year adds the year. Null when the time can't be read.
export const savedWhen = (timestamp, now = new Date()) => {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  const sameDay = date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
  if (sameDay) return `today at ${clock(date)}`;
  const year = date.getFullYear() === now.getFullYear() ? '' : `, ${date.getFullYear()}`;
  return `${MONTHS[date.getMonth()]} ${date.getDate()}${year} at ${clock(date)}`;
};

// The note under the spot header and the stack's value, or null once live
// prices have landed this session. Saved prices name when they were fetched,
// or just say saved when that time can't be read. With nothing saved the
// prices on screen are placeholders, so it says the app is still waiting.
export const spotNote = ({ live, timestamp, now = new Date() }) => {
  if (live) return null;
  if (!timestamp) return 'Waiting for live prices';
  const when = savedWhen(timestamp, now);
  return when ? `Saved prices from ${when}` : 'Saved prices';
};

// Whether one metal's tile shows a price no live fetch this session sent, so
// the tile says "Not live" in place of a day's change it doesn't have.
export const metalNotLive = ({ live, liveMetals, metal }) => !live || !liveMetals?.[metal];

const METAL_ORDER = ['silver', 'gold', 'platinum', 'palladium'];

// The held metals whose price no live fetch this session sent, after a fetch
// has landed. Before any live fetch the note above already covers every metal,
// so this is empty then. `held` maps each metal to the ounces the stack holds.
export const heldNotLive = ({ live, liveMetals, held }) => {
  if (!live) return [];
  return METAL_ORDER.filter((metal) => (Number(held?.[metal]) || 0) > 0 && !liveMetals?.[metal]);
};

// The note under the stack's value when some held metals aren't live, as
// "Platinum price isn't live yet" or "Platinum and palladium prices aren't
// live yet". Null when every held metal is live.
export const partialNote = (metals) => {
  if (!metals || metals.length === 0) return null;
  const names = metals.map((m, i) => (i === 0 ? m.charAt(0).toUpperCase() + m.slice(1) : m));
  if (names.length === 1) return `${names[0]} price isn't live yet`;
  const list = names.length === 2
    ? `${names[0]} and ${names[1]}`
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${list} prices aren't live yet`;
};

// The movers Troy may talk about: only metals with a live price this session,
// so a day's change or a ratio is never quoted over a saved price.
export const liveMovers = ({ live, liveMetals, movers }) =>
  (movers || []).filter((m) => !metalNotLive({ live, liveMetals, metal: m.key }));
