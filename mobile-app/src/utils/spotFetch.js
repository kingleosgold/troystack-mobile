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
//   'timeout'  the fetch timed out, prices left alone and Live too
//              unless onMiss drops it
//   'failed'   any other error, shown as cached
// It never rejects.
//
// An empty, timed out or failed call that's still newest also calls onMiss
// with its outcome, so the screen can stop calling old prices Live once no
// reply has landed for a while (see dropStaleLive).
//
// A good reply that goes stale during its save is held, not dropped. If the
// newer call that overtook it then comes back empty, times out or fails, the
// held reply shows instead (outcome 'applied', no onMiss), so a good reply
// that already landed and saved isn't lost to a miss right behind it. If the
// newer call already missed before the save finished, the reply shows as soon
// as its save does. Either way a reply only shows while it's newer than the
// one on screen, so it can never replace newer prices. apply gets landedAt,
// the clock time the reply came in (read before its save), so Live counts
// its grace from then and not from when the save ended or a held reply
// finally shows. A reply that waits in the held slot isn't shown at all
// once it's past that grace, or once the clock has moved back past its
// landing by more than SET_BACK_TOLERANCE_MS, so old prices can't come back as Live after the app sat in the
// background. A reply shown the moment its save ends (the newest call
// already missed) shows either way, and App.js labels it Live or not from
// landedAt.
import { readSpotReply, spotReplyTime } from './spotReply.js';

export const SPOT_FETCH_OUTCOMES = ['applied', 'stale', 'empty', 'timeout', 'failed'];

// How long prices from the last reply that landed still count as live while
// newer fetches miss. The app fetches every minute while it's open, so a
// blip or two keeps Live and five minutes of misses, or a first fetch after
// a long time in the background that misses, drops it.
export const LIVE_GRACE_MS = 5 * 60 * 1000;

// How far the clock may step back before it counts as set back. A phone's
// network time sync can nudge the clock back a few milliseconds, which hides
// no time in the background, so a step that small still counts as fresh.
export const SET_BACK_TOLERANCE_MS = 1000;

// Whether the clock at now (ms) has moved back past at (ms) by more than the
// tolerance.
export const setBackPast = ({ at, now, toleranceMs = SET_BACK_TOLERANCE_MS }) => (
  typeof at === 'number' && Number.isFinite(at) && now < at - toleranceMs
);

// Whether prices that landed at liveAt (ms) still count as live at now (ms).
// Nothing landed yet means not live. A clock that moved back counts as fresh.
export const keepsLive = ({ liveAt, now, graceMs = LIVE_GRACE_MS }) => (
  typeof liveAt === 'number' && Number.isFinite(liveAt) && now - liveAt <= graceMs
);

// Drops Live once the prices that landed at liveAtRef.current are older than
// the grace. A phone clock set back past liveAt would otherwise keep Live
// until the clock caught up again, so liveAt moves back to now and the grace
// counts from the moment the set-back is seen. The next reply that lands
// stamps liveAt fresh. Returns whether Live stays.
// With setBackDrops, a clock set back past liveAt drops Live outright. The
// app passes it on foreground, where a set-back may hide time spent in the
// background, so the grace doesn't restart from the set-back. A set-back
// smaller than the time since liveAt can't be seen on the wall clock, and
// one within SET_BACK_TOLERANCE_MS of liveAt counts as no set-back at all.
export const dropStaleLive = ({ liveAtRef, now, setLive, graceMs = LIVE_GRACE_MS, setBackDrops = false }) => {
  if (setBackPast({ at: liveAtRef.current, now })) {
    liveAtRef.current = now;
    if (setBackDrops) {
      setLive(false);
      return false;
    }
  }
  const live = keepsLive({ liveAt: liveAtRef.current, now, graceMs });
  if (!live) setLive(false);
  return live;
};

// Per gate: the newest held reply and the ticket of the last call whose
// reply showed. Kept off the gate itself, since createLatestOnly also runs
// the add form's spot lookups and knows nothing about replies.
const heldByGate = new WeakMap();
const heldFor = (gate) => {
  let state = heldByGate.get(gate);
  if (!state) {
    state = { held: null, shownTicket: 0, missedTicket: 0 };
    heldByGate.set(gate, state);
  }
  return state;
};

export const runSpotFetch = async ({
  gate,
  silent = false,
  fetchRaw,
  save,
  getSource,
  setSource,
  apply,
  now = () => new Date(),
  clock = Date.now,
  graceMs = LIVE_GRACE_MS,
  onSaveError,
  onMiss,
}) => {
  const ticket = gate.begin();
  const state = heldFor(gate);
  // Shows a reply held from an older call, when one is newer than what's on
  // screen. Returns whether it showed.
  const showHeld = () => {
    const { held } = state;
    state.held = null;
    if (!held || held.ticket <= state.shownTicket || held.ticket >= ticket) return false;
    // A clock set back past the landing could hide any time in the
    // background, so the held reply is dropped rather than counted fresh.
    // A step back within the tolerance (a time sync nudge) still shows it.
    const at = clock();
    if (setBackPast({ at: held.landedAt, now: at }) || !keepsLive({ liveAt: held.landedAt, now: at, graceMs })) return false;
    try {
      apply({ reply: held.reply, savedAt: held.savedAt, source: held.source, landedAt: held.landedAt });
    } catch {
      return false;
    }
    // A newer reply still saving can show over this one while this call
    // stays newest, the same as after a plain miss.
    state.shownTicket = held.ticket;
    state.missedTicket = ticket;
    return true;
  };
  const miss = (outcome) => {
    if (showHeld()) return 'applied';
    state.missedTicket = ticket;
    try { if (onMiss) onMiss(outcome); } catch { /* the outcome still resolves */ }
    return outcome;
  };
  if (!silent) setSource('loading...');
  try {
    const raw = await fetchRaw();
    // A newer fetch started while this one was out, so its reply wins.
    if (!gate.isCurrent(ticket)) return 'stale';
    const reply = readSpotReply(raw);
    if (!reply) {
      setSource('cached');
      return miss('empty');
    }
    const savedAt = spotReplyTime(raw.timestamp, now());
    // Stamped when the reply came in, before the save, so a slow save (or
    // one the app slept through) can't make the prices look newer than they
    // are.
    const landedAt = clock();
    try {
      await save(reply, savedAt);
    } catch (saveError) {
      try { if (onSaveError) onSaveError(saveError); } catch { /* the reply still shows */ }
    }
    // A fetch that started during the save owns the screen from here, and
    // its own save queues after this one. This reply is held in case that
    // fetch misses, unless a newer one is already held or showing. If the
    // newest fetch already missed, it shows now.
    const source = raw.source || 'live';
    if (!gate.isCurrent(ticket)) {
      if (ticket <= state.shownTicket) return 'stale';
      if (gate.isCurrent(state.missedTicket)) {
        state.held = null;
        apply({ reply, savedAt, source, landedAt });
        state.shownTicket = ticket;
        return 'applied';
      }
      if (!state.held || ticket > state.held.ticket) {
        state.held = { ticket, reply, savedAt, source, landedAt };
      }
      return 'stale';
    }
    // Cleared before apply, so an apply that throws can't let an older held
    // reply show over this newer one's half applied prices.
    state.held = null;
    apply({ reply, savedAt, source, landedAt });
    state.shownTicket = ticket;
    return 'applied';
  } catch (error) {
    // A newer fetch is out, so it settles the source, and this failure can't
    // turn its Live to cached.
    if (!gate.isCurrent(ticket)) return 'stale';
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      // A timeout leaves prices alone, and Live too until onMiss says the
      // last reply is too old. The newest fetch clears a
      // loading still showing, whichever fetch set it, since any older fetch
      // that set it is now dropped and won't clear it.
      if (getSource() === 'loading...') setSource('cached');
      return miss('timeout');
    }
    setSource('cached');
    return miss('failed');
  }
};
