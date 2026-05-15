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

async function hydrate() {
  if (hydrated) return;
  if (hydrationPromise) return hydrationPromise;
  hydrationPromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
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
      hydrated = true;
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
  // Fire-and-forget hydrate so an early call before hydration completes
  // doesn't lose the on-disk history once it arrives.
  if (!hydrated) {
    hydrate().then(() => {
      // After hydration merge: keep the older on-disk events that aren't
      // already in our in-memory buffer (by timestamp identity).
      // Simpler: just ensure scheduleWrite persists current state.
      scheduleWrite();
    });
  }
  scheduleWrite();
}

export async function getLifecycleLog() {
  await hydrate();
  return buffer.slice();
}

export async function clearLifecycleLog() {
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
