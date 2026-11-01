// Keeps only the newest reply. The add form looks up the spot price for a
// purchase date, time or metal, and a slow reply for an earlier pick could
// land after a newer one and overwrite the spot shown for what's picked now.
// Each lookup takes a ticket when it starts, and its reply only applies while
// that ticket is still the newest.
// When the user types a spot while a lookup is pending, the reply still lands
// as the comparison suggestion (so the over 10% warning can show) but it no
// longer fills the spot they typed. Clearing the field back to empty lets a
// pending reply fill it again, so an empty spot can't save as $0.
// Nothing here imports React Native, so it runs under `node --test`.

export const createLatestOnly = () => {
  let newest = 0;
  let kept = false;
  return {
    // Call when a lookup starts, or when the form changes so no earlier
    // lookup should apply anymore.
    begin: () => {
      newest += 1;
      kept = false;
      return newest;
    },
    isCurrent: (ticket) => ticket === newest,
    // Call with what the user typed in the spot field, so a pending reply
    // won't overwrite it. An empty field keeps nothing.
    keepSpot: (value) => {
      kept = String(value ?? '').trim() !== '';
    },
    // Whether the current reply may fill the spot field.
    mayFill: (ticket) => ticket === newest && !kept,
  };
};
