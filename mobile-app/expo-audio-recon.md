# expo-audio Migration Recon

**Repo:** `C:\Users\Jon\Developer\TroyStack\troystack-mobile`
**Working dir:** `mobile-app/`
**HEAD:** `b092220` on `main`
**App.js size:** 14,449 lines
**Recon mode:** READ-ONLY. No source mutations. No installs. No builds. No git mutations.

---

## Section 1 — Current expo-av surface used by Troy voice

Single import on **line 25**:
```js
import { Audio, InterruptionModeIOS } from 'expo-av';
```

That import is the only `expo-av` reference in the entire `mobile-app/` source tree (verified with Grep). Voice is the only consumer.

### Refs / state owned by `AppContent` (declared at line 2043; refs at 2191–2202)

| Symbol | Line | Type | Purpose |
|---|---|---|---|
| `playingMessageId` | 2191 | `useState(null)` | Which assistant message is currently playing (drives UI button states) |
| `isPaused` | 2192 | `useState(false)` | Whether the current sound is paused (drives pause/resume label) |
| `isRecording` | 2193 | `useState(false)` | Whether mic capture is live |
| `currentRecordingRef` | 2194 | `useRef(null)` | Holds live `Audio.Recording` instance between start and stop |
| `recordingStartInFlightRef` | 2195 | `useRef(false)` | PR #11 lock — prevents concurrent `startVoiceRecording` calls |
| `currentSoundRef` | 2196 | `useRef(null)` | Holds live `Audio.Sound` instance between createAsync and unload |

### Every expo-av call in App.js (verified line numbers)

| Function | Line | Call | Purpose |
|---|---|---|---|
| `AppContent` mount `useEffect` | 3600 | `Audio.setAudioModeAsync({ allowsRecordingIOS:false, playsInSilentModeIOS:true, staysActiveInBackground:true, interruptionModeIOS: InterruptionModeIOS.DoNotMix, shouldDuckAndroid:true, playThroughEarpieceAndroid:false })` | Mount-time session setup — pure playback to force speaker routing |
| `stopTroyAudio` | 4435 | `currentSoundRef.current.stopAsync()` | Stop currently playing sound |
| `stopTroyAudio` | 4436 | `currentSoundRef.current.unloadAsync()` | Free the sound resource |
| `startVoiceRecording` | 4465 | `Audio.requestPermissionsAsync()` | Mic permission gate |
| `startVoiceRecording` | 4475 | `currentSoundRef.current.stopAsync()` | Stop any TTS before recording |
| `startVoiceRecording` | 4476 | `currentSoundRef.current.unloadAsync()` | Free TTS resource |
| `startVoiceRecording` | 4484 | `Audio.setAudioModeAsync({ allowsRecordingIOS:true, ... DoNotMix ... })` | PR #11 — flip session to recording before mic capture |
| `startVoiceRecording` | 4494 | `new Audio.Recording()` | Construct recorder |
| `startVoiceRecording` | 4495 | `recording.prepareToRecordAsync({ android: HIGH_QUALITY.android, ios: {...HIGH_QUALITY.ios, extension:'.m4a', outputFormat:MPEG4AAC, audioQuality:HIGH, sampleRate:44100, numberOfChannels:1, bitRate:128000}, web:{}, isMeteringEnabled:true })` | Configure recorder |
| `startVoiceRecording` | 4509 | `recording.startAsync()` | Begin mic capture |
| `startVoiceRecording` (silence poll) | 4526 | `currentRecordingRef.current.getStatusAsync()` | Read `metering` for silence detection |
| `startVoiceRecording` (catch) | 4554 | `Audio.setAudioModeAsync({ allowsRecordingIOS:false ... })` | PR #11 — restore playback mode on error |
| `stopVoiceRecording` (too-short) | 4601 | `recording.stopAndUnloadAsync()` | Discard accidental tap |
| `stopVoiceRecording` (too-short) | 4603 | `Audio.setAudioModeAsync({ allowsRecordingIOS:false ... })` | PR #11 — restore playback mode |
| `stopVoiceRecording` (success) | 4622 | `recording.stopAndUnloadAsync()` | Finalize capture |
| `stopVoiceRecording` (success) | 4624 | `Audio.setAudioModeAsync({ allowsRecordingIOS:false ... })` | PR #11 — restore playback mode |
| `stopVoiceRecording` (success) | 4632 | `recording.getURI()` | Get file URI for upload |
| `stopVoiceRecording` (catch) | 4673 | `Audio.setAudioModeAsync({ allowsRecordingIOS:false ... })` | PR #11 — restore playback mode on error |
| `playTroyVoice` (preflight) | 4704 | `currentSoundRef.current.stopAsync()` | Stop prior sound before new createAsync |
| `playTroyVoice` (preflight) | 4705 | `currentSoundRef.current.unloadAsync()` | Free prior sound |
| `playTroyVoice` | 4719 | `Audio.Sound.createAsync({ uri: speakUrl }, { shouldPlay:true, progressUpdateIntervalMillis:500 })` | Stream backend TTS → play |
| `playTroyVoice` | 4725 | `sound.setOnPlaybackStatusUpdate(cb)` | Watch for `didJustFinish` to clear state |
| `playTroyVoice` (didJustFinish cb) | 4727 | `sound.unloadAsync()` | Free resource at end of playback |
| FlatList render — pause button | 11536 | `currentSoundRef.current.pauseAsync()` | Per-message pause |
| FlatList render — resume button | 11541 | `currentSoundRef.current.playAsync()` | Per-message resume |

### Verified counts

- `Audio.setAudioModeAsync` calls: **6** (mount + 5 around recording boundaries — matches PR #11 expectation).
- `currentSoundRef.current` references: **19** (read + write).
- `currentRecordingRef.current` references: **8**.
- `Audio.Sound|Audio.Recording|Audio.requestPermissions|Audio.setAudioModeAsync|Audio.IOSOutputFormat|Audio.IOSAudioQuality|Audio.RecordingOptionsPresets` matches: **17**.

### setAudioModeAsync config keys passed (always the same shape)

```
allowsRecordingIOS       // toggled true at start of recording, false elsewhere
playsInSilentModeIOS     // always true
staysActiveInBackground  // always true
interruptionModeIOS      // always InterruptionModeIOS.DoNotMix (PR #8 addition)
shouldDuckAndroid        // always true
playThroughEarpieceAndroid // always false
```

**Notable absent key:** there is no `iosCategory` / `iosCategoryMode` / `iosCategoryOptions` set anywhere. This is consistent with the schema check finding (expo-av 16.x has no API to set the AVAudioSession category). This is the suspected root cause of the silent voice across builds 102–104.

### TrackPlayer

`TrackPlayer`, `track-player`, and `setupPlayer` produce **0 matches** in App.js. PR #13 is open but unmerged — as expected. No code in App.js currently imports or calls `react-native-track-player`. (Note: the package is still in `package.json` line 55 — `"react-native-track-player": "^4.1.2"` — it's installed but unused.)

### Other expo-av users

`expo-av` import string appears in **only one file** in the source tree:
```
App.js   (line 25)
```
(plus references in `troy-voice-recon.md`, `package.json`, `package-lock.json` — none of which are runtime code).

Voice is the **sole** consumer of expo-av in this repo.

---

## Section 2 — expo-audio installation status

**Findings (verified):**

1. **`expo-audio` is NOT in `package.json`.** The dependency block (lines 15–59) lists `"expo-av": "~16.0.8"` (line 26) but no `expo-audio` entry. Confirmed by visual read of the entire dependencies block.
2. **`node_modules/expo-audio/` does not exist.** `ls` returns "No such file or directory".
3. **No `expo-audio` directory anywhere in `node_modules/@expo/`.** The full listing of `@expo/` contains: `code-signing-certificates`, `config`, `config-plugins`, `config-types`, `devcert`, `devtools`, `env`, `fingerprint`, `image-utils`, `json-file`, `metro`, `osascript`, `package-manager`, `plist`, `prebuild-config`, `schema-utils`, `sdk-runtime-versions`, `spawn-async`, `sudo-prompt`, `ws-tunnel`, `xcpretty`. **No `expo-audio` and nothing audio-related.**
4. **No type stubs reachable.** `node_modules/expo/` exists but has no audio module re-export. There is nothing in this repo from which expo-audio's TypeScript or runtime types can be read.
5. **SDK version:** `"expo": "^54.0.30"` (`package.json` line 23). expo-audio is officially shipped with SDK 54, so installation should be possible — but is not done.

### Consequence

**Sections 3, 4, and the central question of Section 7 are DEFERRED.** The recon cannot quote or confirm any expo-audio API surface from local sources. Expo's online docs are explicitly NOT acceptable as a substitute (they have led to wrong assumptions in PR #8, #11, and #13).

**Next step (separate prompt, NOT this recon):** `npx expo install expo-audio`. After install, re-run this recon to fill in the deferred sections with quoted type definitions from `node_modules/expo-audio/build/*.d.ts` (or wherever they ship).

This recon does not run `npm`, `npx`, `expo install`, or any other mutating command.

---

## Section 3 — expo-audio API surface

**Source:** `node_modules/expo-audio/build/*.d.ts` (expo-audio `~1.1.1`, just installed). All quotes verbatim.

### Top-level public exports (from `node_modules/expo-audio/build/ExpoAudio.d.ts` and re-exported by `index.d.ts`)

#### 1. `setAudioModeAsync` — line 235 of `ExpoAudio.d.ts`

```ts
export declare function setAudioModeAsync(mode: Partial<AudioMode>): Promise<void>;
```

Configures the global audio behavior and session settings. Accepts a `Partial<AudioMode>` — only specified properties are updated.

The `AudioMode` type, verbatim from `Audio.types.d.ts` lines 420–469:

```ts
export type AudioMode = {
    /**
     * Determines if audio playback is allowed when the device is in silent mode.
     *
     * @platform ios
     */
    playsInSilentMode: boolean;
    /**
     * Determines how the audio session interacts with other audio sessions.
     *
     * - `'doNotMix'`: Requests exclusive audio focus. Other apps will pause their audio.
     * - `'duckOthers'`: Requests audio focus with ducking. Other apps lower their volume but continue playing.
     * - `'mixWithOthers'`: Audio plays alongside other apps without interrupting them.
     *   On Android, this means no audio focus is requested. Best suited for sound effects,
     *   UI feedback, or short audio clips.
     */
    interruptionMode: InterruptionMode;
    /**
     * Determines how the audio session interacts with other sessions on Android.
     *
     * @platform android
     * @deprecated Use `interruptionMode` instead, which now works on both platforms.
     */
    interruptionModeAndroid?: InterruptionModeAndroid;
    /**
     * Whether the audio session allows recording.
     *
     * @default false
     * @platform ios
     */
    allowsRecording: boolean;
    /**
     * Whether the audio session stays active when the app moves to the background.
     * @default false
     */
    shouldPlayInBackground: boolean;
    /**
     * Whether the audio should route through the earpiece.
     * @platform android
     */
    shouldRouteThroughEarpiece: boolean;
    /**
     * Whether audio recording should continue when the app moves to the background.
     *
     * @default false
     * @platform ios
     * @platform android
     */
    allowsBackgroundRecording?: boolean;
};
```

**Important:** there are **no `iosCategory`, `iosCategoryMode`, or `iosCategoryOptions` keys**. The category is **derived** by the native iOS implementation from `playsInSilentMode`, `allowsRecording`, and `interruptionMode`. See Section 7 for the derivation table.

#### 2. `InterruptionMode` — `Audio.types.d.ts` line 483

```ts
export type InterruptionMode = 'mixWithOthers' | 'doNotMix' | 'duckOthers';
```

It is a **string union type, not an enum**. There is **no enum import** to do (unlike `expo-av`'s `InterruptionModeIOS.DoNotMix`). Pass the string literal directly: `interruptionMode: 'doNotMix'`.

`InterruptionModeAndroid` is also exported (line 487) but is just an alias for `InterruptionMode` and is deprecated.

#### 3. `useAudioPlayer` hook — `ExpoAudio.d.ts` line 44

```ts
export declare function useAudioPlayer(source?: AudioSource, options?: AudioPlayerOptions): AudioPlayer;
```

`AudioSource` (verbatim, `Audio.types.d.ts` lines 2–18):

```ts
export type AudioSource = string | number | null | {
    uri?: string;
    assetId?: number;
    headers?: Record<string, string>;
};
```

`AudioPlayerOptions` (relevant fields, `Audio.types.d.ts` lines 22–100):

```ts
export type AudioPlayerOptions = {
    updateInterval?: number;       // ms between status updates, default 500
    downloadFirst?: boolean;       // pre-download remote URL before play
    crossOrigin?: 'anonymous' | 'use-credentials'; // web only
    keepAudioSessionActive?: boolean; // ios only — keep session active across pause/finish
};
```

Returned `AudioPlayer` instance (verbatim from `AudioModule.types.d.ts` lines 15–177; abridged to API surface):

```ts
export declare class AudioPlayer extends SharedObject<AudioEvents> {
    id: number;
    playing: boolean;
    muted: boolean;
    loop: boolean;
    paused: boolean;
    isLoaded: boolean;
    isAudioSamplingSupported: boolean;
    isBuffering: boolean;
    currentTime: number;
    duration: number;
    volume: number;            // 0.0 to 1.0
    playbackRate: number;      // 0.0 to 2.0 on iOS
    shouldCorrectPitch: boolean;
    currentStatus: AudioStatus;

    play(): void;
    pause(): void;
    replace(source: AudioSource): void;   // <- swap to a new uri without remounting
    seekTo(seconds: number, toleranceMillisBefore?: number, toleranceMillisAfter?: number): Promise<void>;
    setPlaybackRate(rate: number, pitchCorrectionQuality?: PitchCorrectionQuality): void;

    setActiveForLockScreen(active: boolean, metadata?: AudioMetadata, options?: AudioLockScreenOptions): void;
    updateLockScreenMetadata(metadata: AudioMetadata): void;
    clearLockScreenControls(): void;

    remove(): void;            // free native resources
}
```

Events (`AudioModule.types.d.ts` lines 207–212):

```ts
export type AudioEvents = {
    playbackStatusUpdate(status: AudioStatus): void;
    audioSampleUpdate(data: AudioSample): void;
};
```

Subscribe via `player.addListener('playbackStatusUpdate', cb)` (inherited from `SharedObject`).

#### 4. `useAudioPlayerStatus` hook — `ExpoAudio.d.ts` line 72

```ts
export declare function useAudioPlayerStatus(player: AudioPlayer): AudioStatus;
```

Returns the current `AudioStatus` (verbatim, `Audio.types.d.ts` lines 137–169):

```ts
export type AudioStatus = {
    id: number;
    currentTime: number;
    playbackState: string;
    timeControlStatus: string;
    reasonForWaitingToPlay: string;
    mute: boolean;
    duration: number;
    playing: boolean;
    loop: boolean;
    didJustFinish: boolean;       // <- replaces expo-av's setOnPlaybackStatusUpdate({didJustFinish})
    isBuffering: boolean;
    isLoaded: boolean;
    playbackRate: number;
    shouldCorrectPitch: boolean;
};
```

#### 5. `useAudioRecorder` hook — `ExpoAudio.d.ts` line 145

```ts
export declare function useAudioRecorder(
    options: RecordingOptions,
    statusListener?: (status: RecordingStatus) => void
): AudioRecorder;
```

Returned `AudioRecorder` instance (verbatim from `AudioModule.types.d.ts` lines 213–284; abridged):

```ts
export declare class AudioRecorder extends SharedObject<RecordingEvents> {
    id: number;
    currentTime: number;       // current length of recording, in seconds
    isRecording: boolean;
    uri: string | null;        // <- replaces expo-av's recording.getURI()

    record(options?: RecordingStartOptions): void;
    stop(): Promise<void>;
    pause(): void;
    getAvailableInputs(): RecordingInput[];
    getCurrentInput(): Promise<RecordingInput>;
    setInput(inputUid: string): void;
    getStatus(): RecorderState;            // <- replaces expo-av's getStatusAsync()
    prepareToRecordAsync(options?: Partial<RecordingOptions>): Promise<void>;
    // (deprecated): startRecordingAtTime, recordForDuration
}
```

`RecorderState` (verbatim, `Audio.types.d.ts` lines 196–209) — note the `metering?` field, which is what we need for silence detection:

```ts
export type RecorderState = {
    canRecord: boolean;
    isRecording: boolean;
    durationMillis: number;
    mediaServicesDidReset: boolean;
    metering?: number;          // <- present when isMeteringEnabled: true was passed
    url: string | null;
};
```

`RecordingStartOptions` (`Audio.types.d.ts` lines 238–264):

```ts
export type RecordingStartOptions = {
    forDuration?: number;   // auto-stop after N seconds
    atTime?: number;        // ios: schedule start (uses AVAudioRecorder.record(atTime:))
};
```

#### 6. `useAudioRecorderState` hook — `ExpoAudio.d.ts` line 174

```ts
export declare function useAudioRecorderState(recorder: AudioRecorder, interval?: number): RecorderState;
```

Polls the recorder at `interval` ms (default 500ms) and returns the current `RecorderState` (with `metering` if metering is enabled). This is the React-side replacement for the manual `setInterval`-driven `getStatusAsync` polling at App.js line 4526.

#### 7. `useAudioSampleListener` — `ExpoAudio.d.ts` line 113

```ts
export declare function useAudioSampleListener(player: AudioPlayer, listener: (data: AudioSample) => void): void;
```

Not relevant to Troy voice. Listed for completeness.

#### 8. Permission API — `ExpoAudio.d.ts` lines 260, 287

```ts
export declare function requestRecordingPermissionsAsync(): Promise<PermissionResponse>;
export declare function getRecordingPermissionsAsync(): Promise<PermissionResponse>;
```

Replace `Audio.requestPermissionsAsync()` 1:1 with `requestRecordingPermissionsAsync()` (just renamed; same `PermissionResponse` shape from `expo-modules-core`).

#### 9. Imperative escape hatch — `ExpoAudio.d.ts` line 183

**YES — expo-audio exposes an imperative API alongside the hook.**

```ts
export declare function createAudioPlayer(
    source?: AudioSource | string | number | null,
    options?: AudioPlayerOptions
): AudioPlayer;
```

The doc comment in source explicitly says:

> Creates an instance of an `AudioPlayer` that doesn't release automatically.
> For most use cases you should use the [`useAudioPlayer`](#useaudioplayersource-options) hook instead.

This is **load-bearing for `playTroyVoice`**. The current pattern (create-a-new-Sound-per-message-tap inside an async event handler) maps cleanly to `createAudioPlayer({ uri: speakUrl })` — no need to hoist a hook to `AppContent`'s top level and route through state. Manual `.remove()` on the returned `AudioPlayer` is required to free resources (replaces `unloadAsync()`).

**There is NO equivalent `createAudioRecorder` exported.** Recording is hooks-only via `useAudioRecorder`. The `AudioRecorder` class is exported as a *type* (`AudioModule.types.d.ts` line 213) but not as a constructable value from the public API. Implication: recording requires `useAudioRecorder` at component top level. The current `new Audio.Recording()` inside `startVoiceRecording` does NOT have a 1:1 imperative replacement.

#### 10. `setIsAudioActiveAsync` — `ExpoAudio.d.ts` line 207

```ts
export declare function setIsAudioActiveAsync(active: boolean): Promise<void>;
```

Globally pauses/resumes the audio subsystem. Useful for AppState transitions. Maps to AVAudioSession activate/deactivate on iOS.

#### 11. `RecordingPresets` — `RecordingConstants.d.ts` line 120

```ts
export declare const RecordingPresets: {
    readonly HIGH_QUALITY: RecordingOptions;
    readonly LOW_QUALITY: RecordingOptions;
};
```

Replaces `Audio.RecordingOptionsPresets`. The `HIGH_QUALITY` preset documented in the source comment block (lines 70–92):

```ts
RecordingPresets.HIGH_QUALITY = {
  extension: '.m4a',
  sampleRate: 44100,
  numberOfChannels: 2,         // <- note: preset is 2; we currently force 1
  bitRate: 128000,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.MAX,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: { mimeType: 'audio/webm', bitsPerSecond: 128000 },
};
```

#### 12. `RecordingOptions` (full type, `Audio.types.d.ts` lines 265–309)

```ts
export type RecordingOptions = {
    isMeteringEnabled?: boolean;        // top-level, same as expo-av
    extension: string;
    sampleRate: number;
    numberOfChannels: number;
    bitRate: number;
    android: RecordingOptionsAndroid;
    ios: RecordingOptionsIos;
    web: RecordingOptionsWeb;
};
```

Note: `extension`, `sampleRate`, `numberOfChannels`, `bitRate` have been **promoted to top-level** (with the per-platform options nested under `ios`/`android`/`web`). This is a small but real schema difference vs. expo-av (where they were under `ios`).

`RecordingOptionsIos` (verbatim, lines 332–377):

```ts
export type RecordingOptionsIos = {
    extension?: string;
    sampleRate?: number;
    outputFormat?: string | IOSOutputFormat | number;
    audioQuality: AudioQuality | number;
    bitRateStrategy?: number;
    bitDepthHint?: number;
    linearPCMBitDepth?: number;
    linearPCMIsBigEndian?: boolean;
    linearPCMIsFloat?: boolean;
};
```

#### 13. `IOSOutputFormat` and `AudioQuality` enums — `RecordingConstants.d.ts` lines 12, 54

```ts
export declare enum IOSOutputFormat {
    LINEARPCM = "lpcm",
    MPEG4AAC = "aac ",
    MPEG4AAC_HE = "aach",
    APPLELOSSLESS = "alac",
    // ... 30+ values total
}

export declare enum AudioQuality {
    MIN = 0,
    LOW = 32,
    MEDIUM = 64,
    HIGH = 96,
    MAX = 127
}
```

`MPEG4AAC` and `HIGH` exist with the same names as expo-av — direct rename: `Audio.IOSOutputFormat.MPEG4AAC` → `IOSOutputFormat.MPEG4AAC` (now a top-level export from expo-audio).

### What is NOT exported

- No `Audio` namespace (everything is top-level).
- No `Sound` class (replaced by `AudioPlayer`).
- No `Recording` class as a constructable value (only the class *type*).
- No `setOnPlaybackStatusUpdate` — replaced by `useAudioPlayerStatus(player)` hook OR `player.addListener('playbackStatusUpdate', cb)`.
- No `interruptionModeIOS`/`interruptionModeAndroid` keys (deprecated alias only).
- No `iosCategory`/`iosCategoryMode`/`iosCategoryOptions` (the central question — see Section 7).

---

## Section 4 — Mapping current behavior to expo-audio

Each row maps a verified expo-av call site (from Section 1) to its expo-audio equivalent, with structural change classification.

### setAudioModeAsync — 6 call sites, all use the same shape

Current shape (from `Audio.setAudioModeAsync` calls at lines 3600, 4484, 4554, 4603, 4624, 4673):

```js
{
  allowsRecordingIOS: <bool>,
  playsInSilentModeIOS: true,
  staysActiveInBackground: true,
  interruptionModeIOS: InterruptionModeIOS.DoNotMix,
  shouldDuckAndroid: true,
  playThroughEarpieceAndroid: false,
}
```

Proposed expo-audio shape:

```js
import { setAudioModeAsync } from 'expo-audio';
await setAudioModeAsync({
  allowsRecording: <bool>,            // was allowsRecordingIOS
  playsInSilentMode: true,            // was playsInSilentModeIOS
  shouldPlayInBackground: true,       // was staysActiveInBackground
  interruptionMode: 'doNotMix',       // was interruptionModeIOS: InterruptionModeIOS.DoNotMix (string union, no enum import)
  shouldRouteThroughEarpiece: false,  // was playThroughEarpieceAndroid
  // shouldDuckAndroid REMOVED — to duck, set interruptionMode: 'duckOthers' instead
  // (we don't need ducking; we use 'doNotMix')
});
```

**Key renames (drop iOS suffix; semantics preserved):**

| expo-av key | expo-audio key | Notes |
|---|---|---|
| `allowsRecordingIOS` | `allowsRecording` | iOS-only attribute either way; key just renamed |
| `playsInSilentModeIOS` | `playsInSilentMode` | Same |
| `staysActiveInBackground` | `shouldPlayInBackground` | Renamed |
| `interruptionModeIOS: InterruptionModeIOS.DoNotMix` | `interruptionMode: 'doNotMix'` | **String union now, no enum import.** Drop `import { InterruptionModeIOS }` from line 25 |
| `playThroughEarpieceAndroid: false` | `shouldRouteThroughEarpiece: false` | Renamed; android-only |
| `shouldDuckAndroid: true` | **DROPPED** — folded into `interruptionMode` | If you wanted ducking, you'd say `interruptionMode: 'duckOthers'`. We use `'doNotMix'` so this flag is irrelevant to our app |

### Full mapping table

| Function | Line | Current (expo-av) | Proposed (expo-audio) | Structural change | Notes |
|---|---|---|---|---|---|
| Mount `useEffect` | 3600 | `Audio.setAudioModeAsync({ allowsRecordingIOS:false, playsInSilentModeIOS:true, staysActiveInBackground:true, interruptionModeIOS: InterruptionModeIOS.DoNotMix, shouldDuckAndroid:true, playThroughEarpieceAndroid:false })` | `setAudioModeAsync({ allowsRecording:false, playsInSilentMode:true, shouldPlayInBackground:true, interruptionMode:'doNotMix', shouldRouteThroughEarpiece:false })` | key rename only | **THIS IS THE FIX** for the silent-voice bug. `playsInSilentMode:true` + `allowsRecording:false` on iOS → category `.playback` → speaker routing. Verified eager in Swift source (Section 7) |
| `stopTroyAudio` | 4435 | `currentSoundRef.current.stopAsync()` | `currentSoundRef.current.pause(); currentSoundRef.current.seekTo(0)` OR `currentSoundRef.current.remove()` | key rename only | `AudioPlayer` has no `stop()` method — pause+seekTo(0) or `.remove()` (frees the player). For our use (one-shot TTS that we want to fully stop), `.remove()` matches the expo-av `stopAsync+unloadAsync` pair |
| `stopTroyAudio` | 4436 | `currentSoundRef.current.unloadAsync()` | `currentSoundRef.current.remove()` | key rename only | Combine with line 4435: a single `.remove()` replaces both |
| `startVoiceRecording` permission gate | 4465 | `Audio.requestPermissionsAsync()` | `requestRecordingPermissionsAsync()` | key rename only | Same `PermissionResponse` shape from `expo-modules-core` |
| `startVoiceRecording` cleanup | 4475 | `currentSoundRef.current.stopAsync()` | `currentSoundRef.current.remove()` | key rename only | Same as 4435/4436 — single `.remove()` |
| `startVoiceRecording` cleanup | 4476 | `currentSoundRef.current.unloadAsync()` | (folded into 4475) | removed entirely | One `.remove()` replaces both |
| `startVoiceRecording` flip mode | 4484 | `Audio.setAudioModeAsync({ allowsRecordingIOS:true, ... })` | `setAudioModeAsync({ allowsRecording:true, playsInSilentMode:true, shouldPlayInBackground:true, interruptionMode:'doNotMix', shouldRouteThroughEarpiece:false })` | key rename only | This is the PR #11 toggle that **finally works** in expo-audio — the eager `setCategory(.playAndRecord)` actually applies |
| `startVoiceRecording` construct recorder | 4494 | `new Audio.Recording()` | `useAudioRecorder(options, statusListener)` at `AppContent` top level | **hook restructure** | `AudioRecorder` class is type-only in public API; no imperative constructor. Must hoist `useAudioRecorder` to `AppContent` (line 2043) and reference `recorder` in `startVoiceRecording`. The `useAudioRecorder` call is component-lifecycle-scoped; `currentRecordingRef` becomes redundant for storage but you may still want a ref to track "is start in flight" |
| `startVoiceRecording` configure | 4495 | `recording.prepareToRecordAsync({ android: HIGH_QUALITY.android, ios: {...HIGH_QUALITY.ios, extension:'.m4a', outputFormat:MPEG4AAC, audioQuality:HIGH, sampleRate:44100, numberOfChannels:1, bitRate:128000}, web:{}, isMeteringEnabled:true })` | `await recorder.prepareToRecordAsync(opts)` where `opts` is the new top-level shape (see below) | lifecycle change | Schema reshape: `extension`, `sampleRate`, `numberOfChannels`, `bitRate` are now top-level on `RecordingOptions` (see Section 6 update). Pass options to `useAudioRecorder` hook OR override per-call in `prepareToRecordAsync`. **Note: preset is `numberOfChannels: 2` — keep the override to `1` for voice** |
| `startVoiceRecording` start | 4509 | `recording.startAsync()` | `recorder.record()` | key rename only | Synchronous in expo-audio (`record(): void` not `Promise`). Optional `RecordingStartOptions` param for `forDuration`/`atTime` |
| Silence-detection poll | 4526 | `currentRecordingRef.current.getStatusAsync()` (returns `metering`) | `recorder.getStatus()` (returns `RecorderState` with `metering`) OR replace with `useAudioRecorderState(recorder, 300)` hook | key rename only | Synchronous now (`getStatus(): RecorderState`, not Promise). The hook variant is cleaner React but the imperative `recorder.getStatus()` keeps the existing `setInterval`-driven poll at line 4526 working with minimal change |
| `startVoiceRecording` catch | 4554 | `Audio.setAudioModeAsync({ allowsRecordingIOS:false ... })` | `setAudioModeAsync({ allowsRecording:false, ...same as line 3600... })` | key rename only | PR #11 restore-on-error, same shape as mount call |
| `stopVoiceRecording` too-short | 4601 | `recording.stopAndUnloadAsync()` | `await recorder.stop()` | key rename only | `stop()` returns `Promise<void>`. There is no separate "unload" — the recorder instance is owned by the hook and lives until unmount |
| `stopVoiceRecording` too-short restore | 4603 | `Audio.setAudioModeAsync({ allowsRecordingIOS:false ... })` | `setAudioModeAsync({ allowsRecording:false, ...same as mount... })` | key rename only | PR #11 toggle back |
| `stopVoiceRecording` success | 4622 | `recording.stopAndUnloadAsync()` | `await recorder.stop()` | key rename only | Same as 4601 |
| `stopVoiceRecording` success restore | 4624 | `Audio.setAudioModeAsync({ allowsRecordingIOS:false ... })` | `setAudioModeAsync({ allowsRecording:false, ...same as mount... })` | key rename only | PR #11 toggle back. **This is the call that gets us back to `.playback` (speaker) for the next `playTroyVoice`** |
| `stopVoiceRecording` URI | 4632 | `recording.getURI()` | `recorder.uri` | key rename only | Property accessor, not method. `string \| null` |
| `stopVoiceRecording` catch | 4673 | `Audio.setAudioModeAsync({ allowsRecordingIOS:false ... })` | `setAudioModeAsync({ allowsRecording:false, ...same as mount... })` | key rename only | PR #11 restore-on-error |
| `playTroyVoice` cleanup | 4704 | `currentSoundRef.current.stopAsync()` | `currentSoundRef.current.remove()` | key rename only | Free prior player |
| `playTroyVoice` cleanup | 4705 | `currentSoundRef.current.unloadAsync()` | (folded into 4704) | removed entirely | Single `.remove()` |
| `playTroyVoice` create | 4719 | `Audio.Sound.createAsync({ uri: speakUrl }, { shouldPlay:true, progressUpdateIntervalMillis:500 })` | `const player = createAudioPlayer({ uri: speakUrl }, { updateInterval:500 }); player.play();` | **none** (still imperative) | `createAudioPlayer` is the imperative escape hatch (`ExpoAudio.d.ts` line 183). Lets us keep the per-tap "create a fresh player for this message's URL" pattern. **No need to hoist a hook to top level**. `shouldPlay: true` becomes explicit `.play()` call. `progressUpdateIntervalMillis` renamed to `updateInterval` |
| `playTroyVoice` status sub | 4725 | `sound.setOnPlaybackStatusUpdate(cb)` | `player.addListener('playbackStatusUpdate', cb)` (from `SharedObject`) | key rename only | `cb` receives `AudioStatus` with `didJustFinish: boolean`. The `subscription.remove()` pattern returned by `addListener` replaces the manual `setOnPlaybackStatusUpdate(null)` cleanup |
| `playTroyVoice` didJustFinish | 4727 | `sound.unloadAsync()` | `player.remove()` | key rename only | Inside the `playbackStatusUpdate` callback when `status.didJustFinish === true` |
| FlatList pause button | 11536 | `currentSoundRef.current.pauseAsync()` | `currentSoundRef.current.pause()` | key rename only | Synchronous now (`pause(): void`) |
| FlatList resume button | 11541 | `currentSoundRef.current.playAsync()` | `currentSoundRef.current.play()` | key rename only | Synchronous now (`play(): void`) |

### Structural change summary

- **17 call sites** total. Of these:
  - **14** are key-rename only.
  - **2** are `removed entirely` (folded `unloadAsync` into a single `.remove()`).
  - **1** is `hook restructure` (recorder construction at line 4494 — must use `useAudioRecorder` hook because no imperative constructor is exported).
  - **1** is `lifecycle change` (recording option shape — top-level promotion of `extension`/`sampleRate`/`numberOfChannels`/`bitRate`).

- **Playback path is much simpler than estimated in Section 5** — `createAudioPlayer` exists, so `playTroyVoice` does NOT need a top-level hook + state-driven URI. The original imperative pattern survives intact.

- **Recording path requires a top-level `useAudioRecorder` hook in `AppContent`**. The recorder lives across renders. Methods (`record`, `stop`, `prepareToRecordAsync`) work as in expo-av. The `currentRecordingRef.current` ref pattern can stay but now points at the hook-returned `recorder` instead of a `new Audio.Recording()` instance. The "is start in flight" `recordingStartInFlightRef` (PR #11 lock) keeps its purpose.

### Things to verify on dev build (physical iPhone)

1. **`createAudioPlayer({ uri })` with a remote URL** — does it stream as expected, or does it require `downloadFirst: true` to be set? `Audio.Sound.createAsync` streamed natively; expo-audio may behave differently for remote URLs. If first play has high latency, switch on `downloadFirst: true`.
2. **`addListener('playbackStatusUpdate', cb)`** — does the `cb` fire as frequently as expo-av's `setOnPlaybackStatusUpdate` did? `updateInterval: 500` is the same default, so it should match.
3. **`recorder.getStatus().metering`** — confirm the value is in dBFS and the silence threshold (`< -40`) at line 4529 still works. AVAudioRecorder semantics are the same so this should be fine.
4. **`recorder.uri` after `await recorder.stop()`** — confirm the URI is populated and the file exists on disk before FormData upload at line 4636.
5. **Coexistence during partial migration** — Section 8 flagged this as Open Question 7. With the imperative `createAudioPlayer` available, there's no need to keep expo-av around for playback at all; we can do the full migration in one PR. Coexistence concern is moot.

---

## Section 5 — Hooks-based API structural concerns

This section IS partially answerable from current code structure.

### How many distinct conceptual audio "instances" exist?

**Two**, played serially (never concurrent):

1. **One playback player** — backend TTS streamed via `Audio.Sound.createAsync({ uri: speakUrl })` (line 4719). Lives in `currentSoundRef.current`.
2. **One recorder** — mic capture via `new Audio.Recording()` (line 4494). Lives in `currentRecordingRef.current`.

The code explicitly serializes them: `startVoiceRecording` calls `currentSoundRef.current.stopAsync() / unloadAsync()` (lines 4475–4476) before creating the recorder. They never coexist.

### How does `playTroyVoice` create Sound instances?

Lines 4719–4723:
```js
const { sound } = await Audio.Sound.createAsync(
  { uri: speakUrl },
  { shouldPlay: true, progressUpdateIntervalMillis: 500 }
);
currentSoundRef.current = sound;
```

**This is created NEW per message tap.** The `speakUrl` is dynamically composed (line 4713) from the message text:
```js
const speakUrl = `${API_BASE_URL}/v1/troy/speak?text=${encodeURIComponent(truncatedText)}&userId=${encodeURIComponent(userId)}`;
```

Each message has a unique URL. The sound instance is constructed inside an async event handler (the user's tap on the per-message Listen button at line 11532). React hooks **cannot be called inside async event handlers** — they must be called at component top level, in a fixed order, on every render. **A naive 1:1 swap to `useAudioPlayer({uri: speakUrl})` does not work** because `speakUrl` is a tap-time value, not a render-time value.

### Top-level component owning voice state

`AppContent` — declared at **line 2043** (`function AppContent() {`). All voice state, refs, and functions live in this component. The default export is `App` at line 14360, which presumably wraps `AppContent` with providers (not relevant for this section).

### Estimated function shape changes

| Function | Likely shape change |
|---|---|
| `playTroyVoice` (4689) | **Yes — needs hook restructure.** Move `useAudioPlayer` to `AppContent` top level, drive via state. The function becomes a state setter (`setSpeakUrl(speakUrl); setShouldPlay(true);`) rather than an imperative create. **OR** use expo-audio's imperative escape hatch IF it exposes one. (Whether it does is DEFERRED.) |
| `stopTroyAudio` (4432) | **Yes — must call hook player's pause/stop method instead of `currentSoundRef.current.stopAsync()`.** |
| `startVoiceRecording` (4451) | **Depends.** If expo-audio's recorder is hook-based (`useAudioRecorder`), needs the same top-level-hoisting that playback does. If it exposes an imperative recorder class analogous to `new Audio.Recording()`, the change is much smaller. **DEFERRED.** |
| `stopVoiceRecording` (4577) | Same — depends on recorder shape. **DEFERRED.** |
| Pause/resume button (11532–11548) | **Yes** — calls `pauseAsync`/`playAsync` on `currentSoundRef.current`. Needs to call the hook player's equivalent. |

The bigger structural question — **"does expo-audio support an imperative API alongside hooks?"** — is **DEFERRED** until types are readable. This is the linchpin: if yes, the migration is ~one-day work. If hooks-only, the migration requires re-architecting `playTroyVoice` and possibly `startVoiceRecording`.

---

## Section 6 — Recording flow concerns

Partially answerable.

### Current recording config (quoted from `startVoiceRecording`, lines 4495–4508)

```js
await recording.prepareToRecordAsync({
  android: Audio.RecordingOptionsPresets.HIGH_QUALITY.android,
  ios: {
    ...Audio.RecordingOptionsPresets.HIGH_QUALITY.ios,
    extension: '.m4a',
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    audioQuality: Audio.IOSAudioQuality.HIGH,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
  },
  web: {},
  isMeteringEnabled: true,
});
```

### Keys used (must verify each is supported by expo-audio's recorder API — DEFERRED)

- `android` (preset spread)
- `ios.extension` = `'.m4a'`
- `ios.outputFormat` = `Audio.IOSOutputFormat.MPEG4AAC`
- `ios.audioQuality` = `Audio.IOSAudioQuality.HIGH`
- `ios.sampleRate` = `44100`
- `ios.numberOfChannels` = `1`
- `ios.bitRate` = `128000`
- `ios` preset spread: `Audio.RecordingOptionsPresets.HIGH_QUALITY.ios`
- `web` = `{}`
- top-level `isMeteringEnabled` = `true` (load-bearing — silence detection at line 4529 reads `status.metering`)

The exact API names in expo-audio for these keys are **DEFERRED**. Some (extension, sampleRate, numberOfChannels, bitRate) are likely 1:1 since they map to AVAudioRecorder. Others (`outputFormat`, `audioQuality`, `RecordingOptionsPresets`, `IOSOutputFormat`, `IOSAudioQuality`) are expo-av-specific enums and the constants will need to be re-resolved.

### Structural beats that ARE answerable

- **Permission flow** (line 4465): `await Audio.requestPermissionsAsync()` — single call, gates entire recording flow. Should map cleanly to whatever expo-audio's permission API is named.
- **URI retrieval** (line 4632): `recording.getURI()` — called after `stopAndUnloadAsync`, returns a local file URI used for `FormData` upload at line 4636. Expo-audio's recorder must expose an equivalent — assumed true (DEFERRED).
- **Recording handle survival**: `currentRecordingRef.current` (line 2194) holds the recorder across the start/stop split. Critical because `startVoiceRecording` returns to the event loop after `startAsync()`, then `stopVoiceRecording` is called from a separate user tap or auto-stop timer. Any expo-audio recorder analogue must support this same imperative-ref pattern OR expose a hook with start/stop methods that survive across renders. **DEFERRED.**
- **Status polling** (line 4526): `getStatusAsync()` returns a `metering` field, polled every 300ms while recording. The migration must preserve `metering` access for silence detection.

---

## Section 7 — iOS audio session category control (CENTRAL QUESTION) — VERDICT

**Verdict: Migration is VIABLE.** The bug fix path is open.

Source quoted below: `node_modules/expo-audio/build/Audio.types.d.ts` (types) and `node_modules/expo-audio/ios/AudioModule.swift` (native iOS implementation).

### Q1 — Does `setAudioModeAsync` accept `iosCategory` / `iosCategoryMode` / `iosCategoryOptions`?

**No, not as keys.** The full `AudioMode` type from `Audio.types.d.ts` lines 420–469 has exactly **7 keys** and none of them name a category:

```ts
export type AudioMode = {
    playsInSilentMode: boolean;       // ios
    interruptionMode: InterruptionMode;   // 'mixWithOthers' | 'doNotMix' | 'duckOthers'
    interruptionModeAndroid?: InterruptionModeAndroid;   // deprecated alias
    allowsRecording: boolean;         // ios
    shouldPlayInBackground: boolean;
    shouldRouteThroughEarpiece: boolean;  // android
    allowsBackgroundRecording?: boolean;
};
```

Same as expo-av at the type-shape level. No way to pass `iosCategory: 'playback'` directly.

### Q2 — Is application of mode changes EAGER or LAZY?

**EAGER.** Verified by reading the Swift source at `node_modules/expo-audio/ios/AudioModule.swift`.

The `AsyncFunction("setAudioModeAsync")` binding at line 30 calls the private `setAudioMode` function unconditionally:

```swift
AsyncFunction("setAudioModeAsync") { (mode: AudioMode) in
  try setAudioMode(mode: mode)
}
```

The `setAudioMode` function at lines 519–582 calls `[AVAudioSession setCategory:...]` on **every invocation**, with no state guard:

```swift
private func setAudioMode(mode: AudioMode) throws {
    try AudioUtils.validateAudioMode(mode: mode)
    let session = AVAudioSession.sharedInstance()
    var category: AVAudioSession.Category = session.category
    // ... derives category from mode flags ...
    if sessionOptions.isEmpty {
      try session.setCategory(category, mode: .default)   // line 578
    } else {
      try session.setCategory(category, options: sessionOptions)   // line 580
    }
}
```

**This is the critical difference vs. TrackPlayer (PR #13).** TrackPlayer only called `setCategory` lazily, gated on `currentItem != nil && playWhenReady == true`, leaving the session uncategorized until first play. expo-audio applies the category eagerly on every JS call.

### Q3 — How is the category determined?

**Derived from mode flags inside `setAudioMode`** at `AudioModule.swift` lines 544–575. There is no way to pass the category explicitly — it is a deterministic function of `playsInSilentMode`, `allowsRecording`, and `interruptionMode`:

```swift
if !mode.playsInSilentMode {
  if mode.interruptionMode == .doNotMix {
    category = .soloAmbient
  } else {
    category = .ambient
  }
  sessionOptions = []
} else {
  category = mode.allowsRecording ? .playAndRecord : .playback

  var categoryOptions: AVAudioSession.CategoryOptions = []
  switch mode.interruptionMode {
  case .doNotMix:
    break
  case .duckOthers:
    categoryOptions.insert(.duckOthers)
  case .mixWithOthers:
    categoryOptions.insert(.mixWithOthers)
  }

  if category == .playAndRecord {
    categoryOptions.insert(.allowBluetoothHFP)   // or .allowBluetooth on Xcode <26
  }

  sessionOptions = categoryOptions
}
```

**Derivation table:**

| `playsInSilentMode` | `allowsRecording` | `interruptionMode` | Resulting iOS category | CategoryOptions |
|---|---|---|---|---|
| `false` | * | `'doNotMix'` | `.soloAmbient` | (none) |
| `false` | * | `'duckOthers'` or `'mixWithOthers'` | `.ambient` | (none) |
| `true` | `false` | `'doNotMix'` | **`.playback`** | (none) — **speaker routing default** |
| `true` | `false` | `'duckOthers'` | `.playback` | `.duckOthers` |
| `true` | `false` | `'mixWithOthers'` | `.playback` | `.mixWithOthers` |
| `true` | `true` | `'doNotMix'` | `.playAndRecord` | `.allowBluetoothHFP` (auto) — earpiece default |
| `true` | `true` | `'duckOthers'` | `.playAndRecord` | `.duckOthers`, `.allowBluetoothHFP` |

**The key row for the silent-voice bug:** `playsInSilentMode: true` + `allowsRecording: false` + `interruptionMode: 'doNotMix'` → `.playback` with no options → **speaker routing**. This is exactly what we need at mount, and exactly what the PR #11 toggle pattern restores after recording stops.

### Q4 — Is `defaultToSpeaker` (AVAudioSessionCategoryOptionDefaultToSpeaker) supported?

**No.** Verified:

```
$ grep -r "defaultToSpeaker\|overrideOutputAudioPort" node_modules/expo-audio/
(no matches)
```

This is a **known limitation**, but it is **NOT a blocker** for our use case. Reasoning:
- We only hit `.playAndRecord` (which routes to earpiece by default) during the brief window between `startVoiceRecording` and `stopVoiceRecording`.
- We don't play TTS during recording. We play TTS in `playTroyVoice`, which runs only when no recording is active and the session is in `.playback` (which routes to speaker by default — no `.defaultToSpeaker` needed).
- The PR #11 toggle pattern (`allowsRecording: true` to start mic, `allowsRecording: false` to stop) returns the session to `.playback` before the next `playTroyVoice` call. Speaker routing is automatic from `.playback`.

If we ever needed to play audio *during* `.playAndRecord` (e.g. confidence-monitor speaker output while recording), we'd need a custom native module call to `AVAudioSession.overrideOutputAudioPort(.speaker)`. That scenario does not exist in the current app.

### Q5 — Is there an explicit activate() method?

Yes — `setIsAudioActiveAsync(active: boolean): Promise<void>` is exported from `ExpoAudio.d.ts` line 207. Internally calls `AVAudioSession.setActive` (verified by grepping the Swift module). But we don't need it: `setAudioModeAsync` already triggers `setCategory` eagerly, and the session activates implicitly on first player creation.

### Migration viability — VERDICT: VIABLE

The migration unblocks the silent-voice bug because:

1. **Eager `setCategory`.** The call at App.js line 3600 (mount-time `setAudioModeAsync`) will, on iOS, immediately call `[AVAudioSession setCategory:.playback options:[]]` — which is the call that has been missing in expo-av (which has no setCategory at all) and which TrackPlayer deferred.

2. **Derived `.playback` from flags we already use.** `playsInSilentMode: true` + `allowsRecording: false` (the mount state) → `.playback`. We don't need `iosCategory` to be a key; we just need the correct category to come out the other side, and it does.

3. **Speaker routing comes free.** `.playback` defaults to speaker on iOS without needing `.defaultToSpeaker`. The existing PR #11 toggle pattern works correctly because each transition flips between `.playAndRecord` (recording window) and `.playback` (everything else), and `.playback` always restores speaker.

4. **PR #11 logic is preserved.** The 5 recording-boundary `setAudioModeAsync` calls (lines 4484, 4554, 4603, 4624, 4673) keep the same toggle semantics they had under expo-av — but now they actually take effect on iOS instead of being silent no-ops.

The recon's earlier "Step 1b fallback (path D-prime / custom native module)" is now confirmed UNNECESSARY. Don't write the native module.

### What still has to be verified at runtime (physical-device dev build)

These are runtime behaviors that static source analysis cannot prove:

1. **Mount-time category application.** Does `setAudioModeAsync` at mount actually result in `[AVAudioSession sharedInstance].category == .playback` BEFORE the first `playTroyVoice` call fires? Verify by running `console.log` on `AVAudioSession.sharedInstance().category.rawValue` from a tiny native debug helper, OR — more pragmatically — by listening to a Troy voice message immediately after app launch. If audible from device speaker → category was applied. If silent → not applied (bug not fixed; investigate further).

2. **Recording → playback transition.** After `stopVoiceRecording` flips `allowsRecording` back to `false`, does the next `playTroyVoice` route to speaker again? Test sequence: tap mic → speak → release → wait for transcript → tap "Listen" on Troy's reply. Audible → transition working. Silent → category got stuck at `.playAndRecord` somehow.

3. **Bluetooth output.** With `.playAndRecord` auto-getting `.allowBluetoothHFP`, does Bluetooth headset audio work as expected during voice input? Verify with AirPods or any BT headset paired to the test device.

4. **Does `playsInSilentMode: true` actually cause audio to play through the device's hardware silent switch?** Slide the iPhone silent switch to silent → tap Listen on a Troy reply → expect audible playback. If silent, the `playsInSilentMode` flag isn't being honored on the device.

These are mandatory acceptance criteria for the production build. Each must pass on a physical iPhone before `eas build --profile production --auto-submit` runs.

---

## Section 8 — Migration risk inventory

### Hook ordering risk

`useAudioPlayer({uri})` (assumed name — DEFERRED) cannot be called inside the existing `playTroyVoice` event handler at line 4689. The current pattern — `Audio.Sound.createAsync({uri: dynamicUrl})` per-message-tap — does NOT translate cleanly. Two options:

- **Option A:** single root-level `useAudioPlayer` in `AppContent` (line 2043). When user taps Listen on message X, set a `[currentSpeakUrl, setCurrentSpeakUrl]` state; the hook's `uri` updates. Requires the hook to support changing-URI-after-mount (DEFERRED — does it auto-reload? does it crash? does it cache the old uri?).
- **Option B:** use an imperative escape hatch if expo-audio exposes one. DEFERRED.

If neither is viable, the migration becomes much larger.

### State machine coupling

The current state machine spans `playingMessageId`, `isPaused`, and the `setOnPlaybackStatusUpdate` callback. The callback at line 4725 fires `didJustFinish`, calls `unloadAsync`, and clears both state values. A hook-based player typically exposes `playerStatus` via `useAudioPlayerStatus` or similar. **The mapping is:**

| Current | Hook-world equivalent (DEFERRED specifics) |
|---|---|
| `playingMessageId !== null` | hook player.playing === true OR a separate `playingMessageId` state we set on play, clear on `didFinish` event |
| `isPaused === true` | hook player.paused === true OR our own state |
| `setOnPlaybackStatusUpdate({didJustFinish})` | likely a `useEffect` watching `useAudioPlayerStatus().didJustFinish` |
| `currentSoundRef.current.pauseAsync()` | hook player's `pause()` method |
| `currentSoundRef.current.playAsync()` | hook player's `play()` method |
| `currentSoundRef.current.stopAsync() + unloadAsync()` | hook player's `release()` / `replace()` / equivalent |

All right-column entries are **DEFERRED** specifically; the left-column shape is verified.

### Other expo-av users in the app

**Voice is the only consumer.** Verified:
- Grep for `expo-av` across `mobile-app/` (excluding `node_modules`) returns 4 files: `App.js`, `troy-voice-recon.md` (a doc), `package.json`, `package-lock.json`. **`App.js` is the only runtime source.**
- Grep for `Audio.` (with dot) returns matches **only in `App.js`**.
- No Stack Signal sound effects, no notification chimes, no other audio call sites.

This is **good news** — migration scope is bounded to one file.

### Native build / Info.plist concerns

`app.json` already has the correct iOS Info.plist entries (verified at lines 44–46):
- `"NSMicrophoneUsageDescription": "TroyStack uses the microphone to let you talk to Troy, your AI stack analyst..."`
- `"UIBackgroundModes": ["audio", ...]`

Android already has `"android.permission.RECORD_AUDIO"` (lines 75 and 80).

expo-audio is part of SDK 54 and should be autolinked once installed. Whether it requires **additional** Info.plist entries beyond what we already have is **DEFERRED** to the post-install recon. Flag to verify.

### TrackPlayer / PR #13

`react-native-track-player` is in `package.json` (line 55) but **NOT imported anywhere in App.js** (Grep confirms 0 matches for `TrackPlayer|track-player|setupPlayer`). PR #13 was prepared but never merged into `main`.

**Recommendation:** PR #13 should be **closed without merging**. The iOS source review showed `setupPlayer` calls `deactivateSession()` at mount when no track is loaded, and `setCategory` only runs when `currentItem != nil && playWhenReady = true` — the "lazy / eager-conditional" anti-pattern. Merging it would actively make things worse.

(This recon does not close the PR. That's a separate action by Jon or the next session. **Recommendation only.**)

The package itself (in `package.json`) can be removed in Step 4 cleanup, after the migration succeeds.

### Testing surface — how to verify a fix on dev build

This is part of why we've been blind-shipping. iOS Simulator's audio routing differs from real device:
- Simulator audio plays through the host Mac's speakers, with no AVAudioSession category enforcement.
- Real device routes through the iOS speaker (or earpiece if category is wrong).
- We've been seeing "works in simulator, silent on TestFlight" because the simulator silently ignores the missing category.

**Mitigation strategy for next builds:**
1. Test on a physical iPhone via dev client (`npx expo start --dev-client` + scan QR).
2. Triangulate with a second physical device (e.g., iPad) to rule out device-specific issues.
3. Only after both confirm audible playback → production build → TestFlight.

This avoids burning a 5th `eas build --profile production` on a guess.

---

## Section 9 — Recommended migration shape

**Multi-PR migration. Single-PR is too risky given the track record this week (PR #8, #11, #13 all wrong).**

### Step 0 — separate prompt, NOT this recon

Run `npx expo install expo-audio`. Re-invoke this recon. The next recon must fill in Sections 3, 4, and the central question of Section 7 with **quoted type definitions from `node_modules/expo-audio/build/*.d.ts`** and **iOS source from `node_modules/expo-audio/ios/`** (specifically: trace whether the JS-bound `setAudioMode` / equivalent calls `[AVAudioSession setCategory:...]` unconditionally or behind a player-state guard).

### Step 1 — separate PR after re-recon

**Smallest possible diff.** Replace the **single mount-time `Audio.setAudioModeAsync` call at line 3600** with expo-audio's equivalent. **Do NOT touch anything else yet.**

- Add expo-audio import alongside expo-av (they should coexist; **verify in re-recon** they don't fight over the session).
- Replace line 3600's call with the expo-audio equivalent that includes `iosCategory: 'playback'` (or whatever the verified key/value is).
- Build to TestFlight.
- **Test on physical iPhone first**, then iPad. Listen for Troy speaking.
- If Troy is audible → **the migration is essentially DONE for the urgent bug.** The rest becomes optional cleanup.
- If Troy is still silent → migration is moot for this bug (see Step 1b).

#### Step 1b — fallback if Step 1 doesn't fix audio

Open path D-prime. Write a custom Expo native module that calls `[[AVAudioSession sharedInstance] setCategory:AVAudioSessionCategoryPlayback withOptions:0 error:nil]` at mount. This is a separate prompt with a separate planning recon. Do not pursue without first confirming Step 1 failed.

### Step 2 — separate PR (optional, only if Step 1 succeeded)

Migrate the playback path: `Audio.Sound.createAsync` → expo-audio's player. This is the bigger refactor (event-handler-create → top-level-hook + state-driven `uri`). Includes:
- `playTroyVoice` (4689) — restructured around `useAudioPlayer` or equivalent
- `stopTroyAudio` (4432) — uses hook player's pause/stop
- Pause/resume button (11532–11548) — same
- The `setOnPlaybackStatusUpdate` callback chain — replaced with hook status subscription

### Step 3 — separate PR

Migrate the recording path: `new Audio.Recording()` → expo-audio's recorder. Includes:
- `startVoiceRecording` (4451)
- `stopVoiceRecording` (4577)
- The 5 PR #11 `setAudioModeAsync` calls around recording boundaries — review whether expo-audio still requires this toggle pattern, or whether the new category APIs make it unnecessary

### Step 4 — cleanup PR

- Remove `expo-av` from `package.json`
- Remove `react-native-track-player` from `package.json` (already unused — verified)
- Close PR #13 without merging (it's a no-op + counterproductive)
- Remove the import on App.js line 25
- Verify no orphaned `Audio.*` references remain

### Hard rule

**At no point in any of these PRs should `eas build --profile production` run more than once per PR.** Each production build must be preceded by physical-device dev-build verification. We've burned 4 builds on this bug. We cannot afford a 5th.

---

## Section 10 — Open questions

These must be answered (with **quoted types from local `node_modules/expo-audio/`**, NOT online docs) before any code is written:

1. **Does expo-audio expose `iosCategory` keys (or equivalents) on its `setAudioMode` / `setAudioModeAsync` analogue?** If no → migration is moot for this bug; pivot to path D-prime (custom native module).

2. **Is application of those keys eager (immediate `[AVAudioSession setCategory:...]` at the JS call site) or lazy (deferred to first player creation)?** If lazy without an explicit `activate()` method → same trap as TrackPlayer; migration won't fix the bug.

3. **Does expo-audio support an imperative `Audio.Sound.createAsync` analogue, or is it hooks-only?** If hooks-only, `playTroyVoice` (line 4689) requires significant restructuring (event-handler create → state-driven hook).

4. **Does `useAudioPlayer({uri})` accept a changing URI after mount?** If yes — does it auto-reload the new URI, or does the developer need to call `replace(newUri)`? The Listen-per-message UX depends on URI-swap semantics.

5. **Are the recording option keys 1:1?** Specifically: `extension`, `outputFormat`, `audioQuality`, `sampleRate`, `numberOfChannels`, `bitRate`, `isMeteringEnabled`. And: are `IOSOutputFormat.MPEG4AAC` and `IOSAudioQuality.HIGH` constants exported under the same names, or renamed?

6. **Does expo-audio's recorder expose `getStatusAsync` (or equivalent) returning a `metering` field?** Silence detection (line 4529, `status.metering < -40`) depends on this.

7. **Does expo-audio coexist with expo-av during a partial migration?** If they fight over `AVAudioSession`, Step 1 can't safely leave expo-av in place. Critical for the multi-PR plan.

8. **Are there new Info.plist entries required by expo-audio beyond the existing `NSMicrophoneUsageDescription` and `UIBackgroundModes: ["audio"]`?** If yes, the first build after Step 1 must include the config-plugin update.

---

## End of Recon

**Status:** Locally answerable sections (1, 2, 5, 6, 8, 9, 10) complete. Sections 3, 4, 7 explicitly DEFERRED pending `npx expo install expo-audio` in a separate prompt.

**Next action:** separate prompt — install expo-audio, then re-invoke this recon.

**Hard rule:** no more `eas build --profile production` until Section 7's central question is answered with quoted types.
