// Lifecycle logger — ring buffer of app startup/lifecycle events persisted
// to AsyncStorage so we can diagnose force-quit / rapid-relaunch bugs.
// Plain module: no React state. Safe to call from anywhere.
//
// CONCURRENCY MODEL — PLATFORM DEPENDENCY
//
// This module relies on AsyncStorage maintaining FIFO ordering for setItem/removeItem
// calls within the JS-thread call sequence. The standard @react-native-async-storage/
// async-storage v1.x backends (iOS SQLite, Android Room) provide this ordering. If we
// ever swap to a backend with concurrent-writer semantics (e.g. MMKV with parallel
// writers) the clearLifecycleLog() vs in-flight logLifecycleEvent() write path can
// reorder, and a pre-clear setItem could land after clear's setItem('[]'), restoring
// cleared events to disk.
//
// Mitigation if that ever happens: add a JS-side promise chain so each setItem awaits
// the prior one, OR add a clear-mutex that awaits any in-flight write before clear's
// own setItem fires. See PR #28 review discussion for details.
//
// This is a diagnostic tool, not production-critical state. The blast radius of the
// race (if ever triggered) is "Clear occasionally leaves phantom events; tap Clear
// again." Acceptable for the use case.
//
// Concurrency model:
//   - Eager hydration at module import (readyPromise). Pre-hydration
//     events queue in pendingEvents and merge into buffer on resolve.
//   - No debounced writes — every post-hydration logLifecycleEvent fires
//     setItem immediately. Removing the timer eliminated the timer-vs-
//     clear race the previous design had to fence around.
//   - clearLifecycleLog awaits readyPromise, then setItem('[]') as the
//     awaited final state of truth (not removeItem; orphan pre-clear
//     setItems landing later are overwritten by the next event call).
//   - writeGeneration in logLifecycleEvent is documentary; JS sync exec
//     between capture and check means it can't actually race in-call.

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'stack_lifecycle_log';
const MAX_EVENTS = 50;

let buffer = [];
let pendingEvents = [];
let hydrated = false;
let writeGeneration = 0;

const readyPromise = AsyncStorage.getItem(STORAGE_KEY)
  .then((raw) => {
    let parsed = [];
    if (raw) {
      try {
        const candidate = JSON.parse(raw);
        if (Array.isArray(candidate)) parsed = candidate;
      } catch (e) {
        // corrupt or unreadable — start fresh, never throw from the logger
      }
    }
    buffer = parsed.concat(pendingEvents).slice(-MAX_EVENTS);
    pendingEvents = [];
    hydrated = true;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(buffer)).catch(() => {});
  })
  .catch(() => {
    // getItem rejection: drain pendingEvents into buffer (no disk read to
    // merge against), then mark hydrated so callers don't deadlock.
    buffer = pendingEvents.slice(-MAX_EVENTS);
    pendingEvents = [];
    hydrated = true;
  });

export function logLifecycleEvent(label, payload) {
  const event = { ts: Date.now(), label };
  if (payload !== undefined) event.payload = payload;

  if (!hydrated) {
    pendingEvents.push(event);
    if (pendingEvents.length > MAX_EVENTS) {
      pendingEvents.splice(0, pendingEvents.length - MAX_EVENTS);
    }
    return;
  }

  buffer.push(event);
  if (buffer.length > MAX_EVENTS) {
    buffer.splice(0, buffer.length - MAX_EVENTS);
  }

  const myWriteGen = writeGeneration;
  const serialised = JSON.stringify(buffer);
  if (myWriteGen === writeGeneration) {
    AsyncStorage.setItem(STORAGE_KEY, serialised).catch(() => {});
  }
}

export async function getLifecycleLog() {
  await readyPromise;
  return buffer.slice();
}

export async function clearLifecycleLog() {
  await readyPromise;
  writeGeneration += 1;
  buffer = [];
  pendingEvents = [];
  try {
    await AsyncStorage.setItem(STORAGE_KEY, '[]');
  } catch (e) {
    // best-effort
  }
}
