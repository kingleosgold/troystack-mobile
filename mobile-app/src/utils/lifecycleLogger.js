// Lifecycle logger — ring buffer of app startup/lifecycle events persisted
// to AsyncStorage so we can diagnose force-quit / rapid-relaunch issues.
//
// Plain module: NO React state, NO context, NO component lifecycle. Safe to
// call from module scope, useEffect, async callbacks, anywhere.
//
// On first call we lazily hydrate the in-memory buffer from disk so the log
// survives JS bundle re-eval (force-quit). Writes are debounced 100ms so
// bursts don't thrash AsyncStorage. Worst case on force-quit is losing the
// last <100ms of events, which is acceptable for diagnostic visibility.

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'stack_lifecycle_log';
const MAX_EVENTS = 50;
const WRITE_DEBOUNCE_MS = 100;

let buffer = [];
let hydrated = false;
let hydrationPromise = null;
let writeTimer = null;
// Generation counter: incremented on every clearLifecycleLog() call. Hydrate
// captures the value at IIFE start and re-checks it before assigning the
// merged buffer; if a clear happened in between, the merge is discarded so
// the cleared state wins. Without this, an orphan hydrate that started
// before clear() would resolve later and repopulate buffer with the very
// events the user just cleared.
let clearGeneration = 0;

async function hydrate() {
  if (hydrated) return;
  if (hydrationPromise) return hydrationPromise;
  hydrationPromise = (async () => {
    // Snapshot the clear-generation at the start so we can detect a clear
    // that lands while AsyncStorage.getItem is in flight. If the user
    // clears mid-hydrate, their intent must win over our stale merge.
    const myGeneration = clearGeneration;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (myGeneration !== clearGeneration) {
        // Clear happened mid-flight. Discard the read entirely —
        // clearLifecycleLog() has already set hydrated=true and emptied
        // the buffer; merging back in would silently undo the clear.
        return;
      }
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // Merge: prior-session events from disk + any events added in
          // memory before hydration finished. In-memory events are always
          // newer (this JS context just booted), so concat preserves order.
          // Cap at MAX_EVENTS, keeping the newest.
          const merged = parsed.concat(buffer);
          buffer = merged.slice(-MAX_EVENTS);
        }
      }
    } catch (e) {
      // Corrupt or unreadable — start fresh. Never throw from the logger.
    } finally {
      // Only assert hydrated=true if no clear raced us. If a clear did
      // happen mid-flight, clearLifecycleLog() already set hydrated=true
      // itself; assigning again here is technically idempotent but the
      // guard makes the ownership of that flag unambiguous.
      if (myGeneration === clearGeneration) {
        hydrated = true;
      }
      hydrationPromise = null;
    }
  })();
  return hydrationPromise;
}

function scheduleWrite() {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    const snapshot = buffer.slice();
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)).catch(() => {});
  }, WRITE_DEBOUNCE_MS);
}

export function logLifecycleEvent(label, payload) {
  const event = { ts: Date.now(), label };
  if (payload !== undefined) event.payload = payload;
  buffer.push(event);
  if (buffer.length > MAX_EVENTS) buffer.splice(0, buffer.length - MAX_EVENTS);

  // Race fix: do NOT schedule a write until hydration has merged the prior
  // session's on-disk events into the in-memory buffer. Without this gate,
  // an early write could persist a pre-merge buffer and overwrite the prior
  // session's history before we get a chance to read and concat it — making
  // cross-session comparison (the whole point of this diagnostic) impossible.
  //
  // Pre-hydration: events accumulate in memory. hydrate() is idempotent via
  // hydrationPromise, so multiple early calls share the same merge. Each
  // call's hydrate().then() schedules a write, but scheduleWrite() has its
  // own writeTimer guard so only the first one fires; by then the buffer
  // contains [merged disk events..., ...pre-hydration in-memory events].
  if (!hydrated) {
    hydrate().then(() => {
      scheduleWrite();
    });
    return;
  }
  scheduleWrite();
}

export async function getLifecycleLog() {
  await hydrate();
  return buffer.slice();
}

export async function clearLifecycleLog() {
  // Invalidate any hydrate() that may have started before this clear —
  // see the generation comment near `let clearGeneration` above.
  clearGeneration += 1;
  buffer = [];
  hydrated = true;
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    // best-effort
  }
}
