// Keeps only the newest reply. The add form looks up the spot price for a
// purchase date, time or metal, and a slow reply for an earlier pick could
// land after a newer one and overwrite the spot shown for what's picked now.
// Each lookup takes a ticket when it starts, and its reply only applies while
// that ticket is still the newest.
// Nothing here imports React Native, so it runs under `node --test`.

export const createLatestOnly = () => {
  let newest = 0;
  return {
    // Call when a lookup starts, or when the form changes so no earlier
    // lookup should apply anymore.
    begin: () => {
      newest += 1;
      return newest;
    },
    isCurrent: (ticket) => ticket === newest,
  };
};
