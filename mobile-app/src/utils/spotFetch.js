// The app's foreground spot price fetch, with React Native passed in, so the
// order of its steps and what happens when two calls overlap can be driven
// under `node --test`. App.js's fetchSpotPrices hands it a gate from
// createLatestOnly, the fetch, the save and the screen's setters.
//
// Each call takes a ticket when it starts. A call that's no longer newest
// stops after the fetch (shows and saves nothing), after its save, and at the
// top of the catch, so an older call landing or failing late can't overwrite
// a newer one's prices or turn its Live to cached. A good reply's prices, time,
// Live metals, change and source all apply together after the save, so a
// reply never shows half applied. A failed save is caught on its own, so the
// reply still shows as live and the next launch starts from older saved ones.
//
// Resolves with what happened, so a caller can log it without reading the
// source ref after a newer call may have changed it:
//   'applied'  the reply showed
//   'stale'    a newer call started, so this one showed nothing
//   'empty'    no metal cleared its floor, shown as cached
//   'timeout'  the fetch timed out, prices and Live left alone
//   'failed'   any other error, shown as cached
// It never rejects.
import { readSpotReply, spotReplyTime } from './spotReply.js';

export const SPOT_FETCH_OUTCOMES = ['applied', 'stale', 'empty', 'timeout', 'failed'];

export const runSpotFetch = async ({
  gate,
  silent = false,
  fetchRaw,
  save,
  getSource,
  setSource,
  apply,
  now = () => new Date(),
  onSaveError,
}) => {
  const ticket = gate.begin();
  if (!silent) setSource('loading...');
  try {
    const raw = await fetchRaw();
    // A newer fetch started while this one was out, so its reply wins.
    if (!gate.isCurrent(ticket)) return 'stale';
    const reply = readSpotReply(raw);
    if (!reply) {
      setSource('cached');
      return 'empty';
    }
    const savedAt = spotReplyTime(raw.timestamp, now());
    try {
      await save(reply, savedAt);
    } catch (saveError) {
      try { if (onSaveError) onSaveError(saveError); } catch { /* the reply still shows */ }
    }
    // A fetch that started during the save owns the screen from here, and
    // its own save queues after this one.
    if (!gate.isCurrent(ticket)) return 'stale';
    apply({ reply, savedAt, source: raw.source || 'live' });
    return 'applied';
  } catch (error) {
    // A newer fetch is out, so it settles the source, and this failure can't
    // turn its Live to cached.
    if (!gate.isCurrent(ticket)) return 'stale';
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      // A timeout leaves prices and Live alone. The newest fetch clears a
      // loading still showing, whichever fetch set it, since any older fetch
      // that set it is now dropped and won't clear it.
      if (getSource() === 'loading...') setSource('cached');
      return 'timeout';
    }
    setSource('cached');
    return 'failed';
  }
};
