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
