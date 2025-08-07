import { parseBlob } from "music-metadata";
import { getBookData } from "./genericBookDataGetters/getBookData";

// --- Interfaces and Types ---
export interface TrackState {
  transitionPoints?: number[];
  audioBuffer?: AudioBuffer;
  sourceNode?: AudioBufferSourceNode | null;
  gainNode?: GainNode | null;
  duration?: number; // Added for pre-emptive transition
  preemptiveTransitionTimeout?: ReturnType<typeof setTimeout> | null; // Added for managing pre-emptive transition
  coverArtUrl: string;
  title: string;
  trackLength: number;
  startedAtCtxTime?: number | null; // AudioContext.currentTime when playback (this instance) started
  offsetAtStart?: number; // Offset (in seconds) passed to source.start()
  pausedAt?: number | null; // Position (in seconds) frozen when paused
}

// --- Configuration ---
const FADE_DURATION_SECONDS = 8.0;
const PRE_END_TRANSITION_TRIGGER_SECONDS = 4.0; // Time before track end to trigger transition
/**
 * Exponent for non-linear volume scaling.
 * This makes the lower end of the slider have a finer control.
 * The value 1.737 is chosen so that a slider value of 0.5 corresponds to a gain of ~0.3.
 */
const VOLUME_SCALE = 1.737;

const PLAYLIST_LOAD_STAGGER_MS = 100;
const PLAYLIST_UPDATE_DEBOUNCE_MS = 300;

const STREAMING_FILE_SIZE_THRESHOLD = 1024 * 1024;

// --- Module-level State ---
let audioContext: AudioContext | null = null;
const tracks: Map<string, TrackState> = new Map();
const liveSources = new Set<AudioBufferSourceNode>(); // keep track of every live node
let masterGainNode: GainNode | null = null;
let backgroundGainNode: GainNode | null = null;
let audiobookGainNode: GainNode | null = null;

// localStorage keys used by AudioPlayer.tsx via useLocalStorageState
const LS_VOLUME_KEY = "volume";
const LS_BALANCE_KEY = "balance";
const LS_MUTED_KEY = "isMuted";

let currentTrackId: string | null = null;
let nextTrackId: string | null = null; // Track being faded TO (during active crossfade)
let isTransitioning = false; // Is a crossfade actively happening?

let currentSectionTracks: string[] | null = null;
let currentTrackIndexInSection: number = -1;
// undefined: no pending change; null: pending clear; string[]: pending set
let pendingSectionTracks: string[] | null | undefined = undefined;

// Debouncing for playlist updates to avoid UI spam
let playlistUpdateTimeout: ReturnType<typeof setTimeout> | null = null;

const bookData = getBookData();

export function getTrackDetailsById(id: string): TrackState | null {
  return tracks.get(id) || null;
}

export function getCurrentTrackData(): TrackState | null {
  if (!currentTrackId) return null;
  return tracks.get(currentTrackId) || null;
}

// --- Core Functions ---

export function getAudioContext(): AudioContext | null {
  return audioContext;
}

function announceSongTransition(trackData?: TrackState | null) {
  const dataToSend = trackData !== undefined ? trackData : getCurrentTrackData();
  window.dispatchEvent(new CustomEvent("songTransition", { detail: dataToSend }));
}

export async function initAudioContext(): Promise<boolean> {
  if (!audioContext) {
    try {
      const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) {
        console.error("Web Audio API not supported by this browser.");
        return false;
      }
      audioContext = new AudioContextClass();
      console.log(`AudioContext initialized. State: ${audioContext.state}`);
      audioContext.onstatechange = () => {
        console.log(`AudioContext state changed to: ${audioContext?.state}`);
      };

      // Create master gain node
      masterGainNode = audioContext.createGain();
      // Create separate gain nodes for background music and audiobook
      backgroundGainNode = audioContext.createGain();
      audiobookGainNode = audioContext.createGain();

      // --- Initialize volume, balance, and mute state from localStorage ---
      const defaultVolume = 0.5;
      const defaultBalance = 0.5;
      // useLocalStorageState stores booleans as "true" or "false" strings
      const defaultIsMutedSerialized = "false";

      const storedVolumeStr = localStorage.getItem(LS_VOLUME_KEY);
      const storedBalanceStr = localStorage.getItem(LS_BALANCE_KEY);
      const storedMutedStr = localStorage.getItem(LS_MUTED_KEY);

      let initialVolume = storedVolumeStr !== null ? parseFloat(storedVolumeStr) : defaultVolume;
      if (isNaN(initialVolume)) initialVolume = defaultVolume;

      let initialBalance = storedBalanceStr !== null ? parseFloat(storedBalanceStr) : defaultBalance;
      if (isNaN(initialBalance)) initialBalance = defaultBalance;

      // Ensure values are within the expected 0-1 range
      initialVolume = Math.max(0, Math.min(1, initialVolume));
      initialBalance = Math.max(0, Math.min(1, initialBalance));

      const isInitiallyMuted = (storedMutedStr !== null ? storedMutedStr : defaultIsMutedSerialized) === "true";

      // Apply non-linear scaling for the initial volume
      const scaledInitialVolume = Math.pow(initialVolume, VOLUME_SCALE);

      // Set initial gains based on localStorage values
      masterGainNode.gain.value = isInitiallyMuted ? 0 : scaledInitialVolume;
      backgroundGainNode.gain.value = initialBalance;
      audiobookGainNode.gain.value = 1.0 - initialBalance;
      // --- End of localStorage initialization ---

      // Connect both to master gain
      backgroundGainNode.connect(masterGainNode);
      audiobookGainNode.connect(masterGainNode);

      // Connect master to destination
      masterGainNode.connect(audioContext.destination);

      // Resume the context if needed
      if (audioContext.state === "suspended") {
        try {
          await audioContext.resume();
          console.log("AudioContext resumed on init.");
        } catch (e) {
          console.error("Failed to resume AudioContext on init:", e);
        }
      }
    } catch (e) {
      console.error("Error creating AudioContext:", e);
      return false;
    }
  } else if (audioContext.state === "suspended") {
    try {
      await audioContext.resume();
      console.log("Existing AudioContext resumed.");
    } catch (e) {
      console.error("Error resuming existing AudioContext:", e);
    }
  }

  // Return true only if the context is running
  return audioContext?.state === "running";
}
function buildUrl(trackId: string): string {
  return `/${bookData.slug}/${trackId}.mp3`; // → /1984/background-forest.mp3
}
function isFetchOk(res: Response, url: string): boolean {
  const local = url.startsWith("/");
  return res.ok || (local && res.status === 0);
}

/**
 * Creates a complete TrackState object from a decoded audio buffer and its metadata.
 * This helper centralizes the creation logic to avoid duplication.
 * @param audioBuffer - The fully decoded audio buffer.
 * @param metadata - An object containing title, coverArtUrl, and optional transitionPoints.
 * @returns A complete TrackState object, ready to be cached.
 */
function createTrackState(audioBuffer: AudioBuffer, metadata: { title: string; coverArtUrl: string; transitionPoints?: number[] }): TrackState {
  return {
    audioBuffer,
    duration: audioBuffer.duration,
    trackLength: audioBuffer.duration,
    title: metadata.title,
    coverArtUrl: metadata.coverArtUrl,
    transitionPoints: metadata.transitionPoints,
    sourceNode: null,
    gainNode: null,
  };
}

async function streamingDecodeAudioData(
  audioContext: AudioContext,
  arrayBuffer: ArrayBuffer,
  trackId: string,
  title: string,
  coverArtUrl: string,
  transitionPoints?: number[],
): Promise<AudioBuffer | null> {
  try {
    // Create chunks for progressive decoding (roughly 3-second chunks)
    const PLAYBACK_START_THRESHOLD = 512 * 1024; // Start playing after 512KB decoded

    // Try to decode first chunk to get audio format info and start playback early
    const firstChunk = arrayBuffer.slice(0, Math.min(PLAYBACK_START_THRESHOLD, arrayBuffer.byteLength));

    try {
      const firstChunkByteLength = firstChunk.byteLength;
      const firstBuffer = await audioContext.decodeAudioData(firstChunk);

      // Store partial track info to enable early playback
      const partialTrackState: TrackState = {
        audioBuffer: firstBuffer,
        duration: (arrayBuffer.byteLength / firstChunkByteLength) * firstBuffer.duration, // More accurate estimate
        transitionPoints,
        sourceNode: null,
        gainNode: null,
        coverArtUrl,
        title,
        trackLength: (arrayBuffer.byteLength / firstChunk.byteLength) * firstBuffer.duration,
      };

      tracks.set(trackId, partialTrackState);

      console.log(`🎵 Early playback ready for '${trackId}' - ${firstBuffer.duration.toFixed(2)}s decoded`);

      // Dispatch early availability event
      window.dispatchEvent(new CustomEvent("trackPartiallyLoaded", { detail: { trackId, partialDuration: firstBuffer.duration, estimatedTotal: partialTrackState.duration } }));
    } catch (e) {
      console.warn(`Failed to decode first chunk of '${trackId}', falling back to full decode:`, e);
      return null;
    }

    // Continue decoding the full file in the background
    setTimeout(async () => {
      try {
        const fullAudioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        // Update the track with the complete buffer
        const updatedTrackState = createTrackState(fullAudioBuffer, { title, coverArtUrl, transitionPoints });
        tracks.set(trackId, updatedTrackState);

        console.log(`✅ Full decode complete for '${trackId}' - ${fullAudioBuffer.duration.toFixed(2)}s`);

        // Dispatch full loading complete event
        window.dispatchEvent(new CustomEvent("trackFullyLoaded", { detail: { trackId, fullDuration: fullAudioBuffer.duration } }));
      } catch (e) {
        console.error(`Failed to decode full audio for '${trackId}':`, e);
        // Keep the partial buffer if full decode fails
      }
    }, 0);

    // Return the first chunk buffer to indicate streaming success
    return tracks.get(trackId)?.audioBuffer || null;
  } catch (e) {
    console.error(`Streaming decode failed for '${trackId}':`, e);
    return null;
  }
}

/* MAIN ------------------------------------------------------------------ */
export async function loadTrack(trackId: string, transitionPoints?: number[], enableStreaming: boolean = true): Promise<boolean> {
  /* 1 ▸ make sure AudioContext is alive ---------------------------- */
  if (!audioContext && !(await initAudioContext())) {
    console.error("loadTrack: AudioContext could not be initialized.");
    return false;
  }

  /* 2 ▸ cache hit? ------------------------------------------------- */
  const cached = tracks.get(trackId);
  if (cached?.audioBuffer) {
    if (transitionPoints && cached.transitionPoints !== transitionPoints) {
      cached.transitionPoints = transitionPoints;
    }
    console.log(`✅ Track '${trackId}' already loaded from cache`);
    return true;
  }

  // Check if track is currently being loaded to prevent duplicates
  if (cached && !cached.audioBuffer) {
    console.log(`⏳ Track '${trackId}' is already being loaded, waiting...`);
    // Wait for the existing load to complete
    let attempts = 0;
    while (attempts < 50) {
      // Max 5 seconds
      await new Promise((resolve) => setTimeout(resolve, 100));
      const updated = tracks.get(trackId);
      if (updated?.audioBuffer) {
        console.log(`✅ Track '${trackId}' loaded by another process`);
        return true;
      }
      attempts++;
    }
    console.warn(`⚠️ Timeout waiting for '${trackId}' to load`);
  }

  // Mark as being loaded to prevent duplicates
  tracks.set(trackId, { coverArtUrl: "", title: trackId, trackLength: 0, sourceNode: null, gainNode: null });

  /* 3 ▸ fetch ------------------------------------------------------ */
  const url = buildUrl(trackId);
  console.log(`🎼 Loading background '${trackId}' from ${url}`);

  let arrayBuffer: ArrayBuffer;
  try {
    const res = await fetch(url);
    if (!isFetchOk(res, url)) {
      throw new Error(`Fetch failed: HTTP ${res.status}`);
    }
    arrayBuffer = await res.arrayBuffer();
    if (!arrayBuffer.byteLength) throw new Error("Empty file");
  } catch (e) {
    console.error(`❌ Fetch error for '${trackId}':`, e);
    tracks.delete(trackId);
    return false;
  }

  /* 4 ▸ parse metadata & streaming decode -------------------------- */
  let coverArtUrl: string | undefined;
  let title = trackId;

  try {
    /* ── 4a metadata (ID3) ───────────────────────────────────────── */
    const { common } = await parseBlob(new Blob([arrayBuffer], { type: "audio/mpeg" }));
    title = common.title || title;

    if (common.picture?.[0]) {
      const pic = common.picture[0];
      const blob = new Blob([new Uint8Array(pic.data)], { type: pic.format });
      coverArtUrl = URL.createObjectURL(blob);
    }

    /* ── 4b streaming decode ─────────────────────────────────────── */
    if (enableStreaming && arrayBuffer.byteLength > STREAMING_FILE_SIZE_THRESHOLD) {
      // Only use streaming for files > 1MB
      if (!audioContext) {
        console.error("AudioContext became null during streaming setup");
        tracks.delete(trackId);
        return false;
      }
      const audioBuffer = await streamingDecodeAudioData(audioContext, arrayBuffer, trackId, title, coverArtUrl || "", transitionPoints);
      if (audioBuffer) {
        console.log(`✅ Streaming decoded '${trackId}' – ${audioBuffer.duration.toFixed(2)} s` + (transitionPoints ? ` | transitions: ${transitionPoints.join(", ")}` : ""));
        return true;
      }
      // Fall back to regular decode if streaming failed
      console.warn(`⚠️ Streaming decode failed for '${trackId}', falling back to regular decode`);
    }

    /* ── 4c regular decode (fallback or small files) ──────────────── */
    const audioBuffer = await audioContext!.decodeAudioData(arrayBuffer);

    /* 5 ▸ cache & done ---------------------------------------------- */
    const trackState = createTrackState(audioBuffer, { title, coverArtUrl: coverArtUrl || "", transitionPoints });
    tracks.set(trackId, trackState);

    console.log(`✅ Decoded '${trackId}' – ${audioBuffer.duration.toFixed(2)} s` + (transitionPoints ? ` | transitions: ${transitionPoints.join(", ")}` : ""));
    return true;
  } catch (e) {
    console.error(`❌ metadata/decode error for '${trackId}':`, e);
    if (coverArtUrl) URL.revokeObjectURL(coverArtUrl);
    tracks.delete(trackId);
    return false;
  }
}

function playTrack(trackId: string, startTime: number = 0, offset: number = 0, skipStopInternal: boolean = false): boolean {
  if (!audioContext || audioContext.state !== "running") {
    console.error(`Cannot play track '${trackId}', AudioContext not ready/running. State: ${audioContext?.state}`);
    initAudioContext(); // Attempt to re-init/resume
    return false;
  }

  const state = tracks.get(trackId);
  if (!state?.audioBuffer) {
    console.error(`AudioBuffer missing for '${trackId}'. Cannot play.`);
    return false;
  }

  // Update background volume without stopping audiobook
  if (backgroundGainNode) {
    setBackgroundVolume(backgroundGainNode.gain.value, false);
  }

  if (!skipStopInternal) {
    stopTrackInternal(trackId); // Stop any previous instance of this specific track
  }

  const source = audioContext.createBufferSource();
  const gainNode = audioContext.createGain();
  source.buffer = state.audioBuffer;
  source.loop = false; // onended will handle sequence
  gainNode.gain.setValueAtTime(startTime <= audioContext.currentTime ? 1 : 0, startTime);

  // Connect to background gain node instead of master gain
  source.connect(gainNode);
  gainNode.connect(backgroundGainNode || masterGainNode);

  liveSources.add(source);

  // Clear any existing preemptive transition timeout for this track if it's being re-played
  const existingStateForTimeout = tracks.get(trackId);
  if (existingStateForTimeout?.preemptiveTransitionTimeout) {
    clearTimeout(existingStateForTimeout.preemptiveTransitionTimeout);
    existingStateForTimeout.preemptiveTransitionTimeout = null;
  }

  source.onended = async () => {
    liveSources.delete(source);
    const stateAtEnd = tracks.get(trackId);
    const thisSourceInstanceEnded = stateAtEnd?.sourceNode === source;

    // Check if this was a partial buffer that ended early due to streaming
    const currentPosition = getCurrentTrackPosition();
    const bufferDuration = state.audioBuffer?.duration || 0;
    const wasPartialEnding = currentPosition !== null && currentPosition < state.trackLength - 1 && Math.abs(currentPosition - bufferDuration) < 0.5;

    if (wasPartialEnding && trackId === currentTrackId) {
      console.log(`Partial buffer ended for '${trackId}' at ${currentPosition?.toFixed(2)}s. Checking for full buffer...`);

      // Wait for the full buffer using an event-driven approach with a timeout.
      const bufferPromise = new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
          window.removeEventListener("trackFullyLoaded", listener);
          console.warn(`Timed out waiting for full buffer for '${trackId}'.`);
          resolve(false);
        }, 5000);

        const listener = (e: Event) => {
          if ((e as CustomEvent).detail.trackId === trackId) {
            clearTimeout(timeout);
            window.removeEventListener("trackFullyLoaded", listener);
            resolve(true);
          }
        };

        window.addEventListener("trackFullyLoaded", listener);
      });

      if (await bufferPromise) {
        console.log(`Full buffer now available for '${trackId}'. Continuing playback from ${currentPosition?.toFixed(2)}s`);
        if (currentPosition !== null) {
          playTrack(trackId, audioContext?.currentTime || 0, currentPosition);
        }
      }
      return;
    }

    // Conditions for this onended handler to take action:
    // 1. This track (trackId) must be the currentTrackId.
    // 2. No transition should be currently active (isTransitioning === false).
    //    This means either the track ended naturally without a pre-emptive fade,
    //    OR a fade completed, isTransitioning is now false, and *then* the new track ended.
    // 3. This specific source instance (source) must be the one that ended, not one already stopped/replaced.
    if (trackId === currentTrackId && !isTransitioning && thisSourceInstanceEnded) {
      console.log(`onended for current track '${trackId}'. No active transition. Attempting to play next in section.`);
      if (currentSectionTracks && currentSectionTracks.length > 0) {
        await playNextTrackInSection();
      } else {
        console.log(`Track '${trackId}' ended, but no section or section empty. Clearing currentTrackId.`);
        currentTrackId = null;
        currentTrackIndexInSection = -1;
      }
    } else {
      console.log(
        `onended for '${trackId}': Conditions not met for auto-play next. currentTrackId: ${currentTrackId}, isTransitioning: ${isTransitioning}, thisSourceInstanceEnded: ${thisSourceInstanceEnded}, sourceNodeAtEnd: ${stateAtEnd?.sourceNode === source}`,
      );
    }
  };

  try {
    source.start(startTime, offset % state.audioBuffer.duration);
    state.sourceNode = source;
    state.gainNode = gainNode;
    state.startedAtCtxTime = startTime;
    state.offsetAtStart = offset;
    state.pausedAt = null;
    console.log(`🎵 Started '${trackId}' @ ${startTime.toFixed(2)}s (offset ${offset.toFixed(2)}s). Duration: ${state.audioBuffer.duration.toFixed(2)}s`);

    // Schedule pre-emptive transition
    if (currentSectionTracks && currentSectionTracks.length > 0 && state.duration && audioContext) {
      const effectiveTrackDurationSecs = state.duration - (offset % state.audioBuffer.duration);
      const timeUntilPreemptiveTrigger = effectiveTrackDurationSecs - PRE_END_TRANSITION_TRIGGER_SECONDS;

      if (timeUntilPreemptiveTrigger > FADE_DURATION_SECONDS / 2 && timeUntilPreemptiveTrigger > 0.2) {
        // Ensure there's enough time for a meaningful fade trigger
        const preemptiveTimeoutId = setTimeout(() => {
          const currentAudioContext = audioContext; // Capture current audioContext
          if (!currentAudioContext) return;

          // Check conditions again inside timeout, as state might have changed
          if (trackId === currentTrackId && !isTransitioning && currentSectionTracks && currentSectionTracks.length > 0) {
            const currentIndex = currentSectionTracks.indexOf(trackId);
            if (currentIndex !== -1) {
              const nextIndex = (currentIndex + 1) % currentSectionTracks.length;
              const nextTrackToPlay = currentSectionTracks[nextIndex];
              console.log(`Pre-emptive transition: Current '${trackId}' nearing end. Triggering transition to '${nextTrackToPlay}'.`);

              (async () => {
                const loaded = await loadTrack(nextTrackToPlay); // Ensure next track is loaded
                // Re-check critical conditions after await, especially audioContext and current track/transition state
                if (audioContext && audioContext.state === "running" && trackId === currentTrackId && !isTransitioning && tracks.has(trackId)) {
                  console.log(`Pre-emptive: initiating crossfade from ${trackId} to ${nextTrackToPlay} at ${audioContext.currentTime.toFixed(2)}s`);
                  await performCrossfade(trackId, nextTrackToPlay, audioContext.currentTime);
                } else {
                  console.warn(`Pre-emptive transition for ${trackId} -> ${nextTrackToPlay} aborted. Load failed: ${!loaded}, or audio context/track state changed.`);
                }
              })();
            }
          }
          const trackStateForTimeout = tracks.get(trackId);
          if (trackStateForTimeout) trackStateForTimeout.preemptiveTransitionTimeout = null;
        }, timeUntilPreemptiveTrigger * 1000);

        if (tracks.has(trackId)) tracks.get(trackId)!.preemptiveTransitionTimeout = preemptiveTimeoutId;
        console.log(`Scheduled pre-emptive transition for '${trackId}' in ${timeUntilPreemptiveTrigger.toFixed(2)}s.`);
      } else {
        console.log(
          `Track '${trackId}' is too short or offset too large for a pre-emptive transition starting ${PRE_END_TRANSITION_TRIGGER_SECONDS}s before end and ensuring enough fade time. Effective duration for trigger calc: ${effectiveTrackDurationSecs.toFixed(2)}s. Relies on onended.`,
        );
      }
    }
    return true;
  } catch (err) {
    console.error(`Error starting source node for '${trackId}':`, err);
    stopTrackInternal(trackId);
    return false;
  }
}

function stopTrackInternal(trackId: string) {
  const state = tracks.get(trackId);
  if (!state) return;

  if (state.preemptiveTransitionTimeout) {
    clearTimeout(state.preemptiveTransitionTimeout);
    state.preemptiveTransitionTimeout = null;
    // console.log(`Cleared pre-emptive transition timeout for '${trackId}' during stop.`);
  }

  if (state.sourceNode) {
    liveSources.delete(state.sourceNode);
    state.sourceNode.onended = null;
    try {
      state.sourceNode.stop();
    } catch {
      // Linter: Unused 'e' -> _ignoredError -> empty catch
      /* console.warn(`Ignoring error stopping source node for ${trackId}:`, e); */
    }
    try {
      state.sourceNode.disconnect();
    } catch {
      // Linter: Unused 'e' -> empty catch
      /* console.warn(`Ignoring error disconnecting source node for ${trackId}:`, e); */
    }
    state.sourceNode = null;
  }
  if (state.gainNode) {
    try {
      state.gainNode.disconnect();
    } catch {
      // Linter: Unused 'e' -> empty catch
      /* console.warn(`Ignoring error disconnecting gain node for ${trackId}:`, e); */
    }
    state.gainNode = null;
  }
  // console.log(`Stopped internal nodes for ${trackId}`);
}

async function playNextTrackInSection(): Promise<void> {
  if (!audioContext || !currentSectionTracks || currentSectionTracks.length === 0 || isTransitioning) {
    console.log(
      `playNextTrackInSection: Conditions not met. Context: ${!!audioContext}, Section: ${!!currentSectionTracks}, Tracks: ${currentSectionTracks?.length}, Transitioning: ${isTransitioning}`,
    );
    if (currentTrackId && !isTransitioning && currentSectionTracks && currentSectionTracks.length > 0) {
      // Current track ended, but we decided not to play next (e.g. end of non-looping section)
      // This logic may need refinement based on whether sections should loop or stop.
      // For now, assume sections are sequences that play once through unless explicitly re-triggered.
      console.log(`playNextTrackInSection: Current track ${currentTrackId} ended. Section sequence completed or not progressing.`);
      currentTrackId = null; // Nothing is actively being made to play by this function
      currentTrackIndexInSection = -1;
    }
    return;
  }

  const nextIndex = (currentTrackIndexInSection + 1) % currentSectionTracks.length;
  // Simple: if we are at the last track and wrap around, it means the section ended.
  // More complex logic could be: if nextIndex is 0 and currentTrackIndexInSection was last index, then section ended.
  // For now, assume it always loops for simplicity of this example until product requirements say otherwise.
  // If sections should NOT loop, this needs adjustment (e.g., stop if nextIndex is 0 and previous was last).

  const nextTrackIdToPlay = currentSectionTracks[nextIndex];
  console.log(`playNextTrackInSection: Attempting to play next track '${nextTrackIdToPlay}' (index ${nextIndex}) in section [${currentSectionTracks.join(", ")}].`);

  const previousTrackId = currentTrackId;
  const previousIndex = currentTrackIndexInSection;

  const loaded = await loadTrack(nextTrackIdToPlay);
  if (loaded && audioContext && audioContext.state === "running") {
    // Check context state again
    // Update state *just before* playing, now that we know track is loaded
    currentTrackId = nextTrackIdToPlay;
    currentTrackIndexInSection = nextIndex;

    if (!playTrack(nextTrackIdToPlay, audioContext.currentTime, 0)) {
      console.error(`playNextTrackInSection: Failed to play next track '${nextTrackIdToPlay}'. Rolling back state.`);
      currentTrackId = previousTrackId;
      currentTrackIndexInSection = previousIndex;
    } else {
      const trackData = tracks.get(nextTrackIdToPlay);
      announceSongTransition(trackData);

      console.log(`playNextTrackInSection: Successfully started next track '${nextTrackIdToPlay}'.`);
    }
  } else {
    console.error(`playNextTrackInSection: Cannot play next track '${nextTrackIdToPlay}'. Load failed: ${!loaded}, Context not running: ${audioContext?.state !== "running"}.`);
  }
}

function findNextTransitionPoint(trackIdForFadeOut: string): number | null {
  if (!audioContext) return null;
  const state = tracks.get(trackIdForFadeOut);
  if (!state?.sourceNode || !state.audioBuffer || !state.gainNode || state.gainNode.gain.value === 0) {
    console.warn(`findNextTransitionPoint: No valid source/buffer/gain for '${trackIdForFadeOut}' or gain is 0. Cannot determine transition point.`);
    return null;
  }
  return audioContext.currentTime + 1.0;
}

async function performCrossfade(fadeOutId: string, fadeInId: string, transitionStartTime: number) {
  if (!audioContext) {
    console.warn("performCrossfade: AudioContext not available.");
    isTransitioning = false;
    nextTrackId = null;
    return;
  }

  const fadeOutState = tracks.get(fadeOutId);
  const fadeInStateExists = tracks.has(fadeInId) && tracks.get(fadeInId)!.audioBuffer;

  if (!fadeOutState?.gainNode || !fadeInStateExists) {
    console.error(`performCrossfade: Missing data. FadeOutGain: ${!!fadeOutState?.gainNode}, FadeInBuffer: ${fadeInStateExists}. Cannot cross-fade ${fadeOutId} -> ${fadeInId}.`);
    isTransitioning = false;
    nextTrackId = null;
    return;
  }

  console.log(`Performing crossfade: ${fadeOutId} -> ${fadeInId} scheduled at ${transitionStartTime.toFixed(2)}s`);
  isTransitioning = true;
  nextTrackId = fadeInId;

  const fadeEnd = transitionStartTime + FADE_DURATION_SECONDS;

  // ---------- fade-OUT ramp ----------
  const gOut = fadeOutState.gainNode.gain;
  const oldSourceNode = fadeOutState.sourceNode;
  const oldGainNode = fadeOutState.gainNode;
  gOut.cancelScheduledValues(audioContext.currentTime);
  gOut.setValueAtTime(gOut.value, audioContext.currentTime);
  gOut.linearRampToValueAtTime(0, fadeEnd);

  // ---------- fade-IN preparation ----------
  const loaded = await loadTrack(fadeInId);
  if (!loaded) {
    console.error(`performCrossfade: Failed to ensure ${fadeInId} is loaded. Aborting crossfade.`);
    gOut.cancelScheduledValues(audioContext.currentTime);
    gOut.linearRampToValueAtTime(1, audioContext.currentTime + 0.2);
    isTransitioning = false;
    nextTrackId = null;
    return;
  }

  if (!playTrack(fadeInId, transitionStartTime, 0, fadeOutId === fadeInId)) {
    console.error(`performCrossfade: Failed to schedule playTrack for fadeInId: ${fadeInId}. Aborting crossfade.`);
    gOut.cancelScheduledValues(audioContext.currentTime);
    gOut.linearRampToValueAtTime(1, audioContext.currentTime + 0.2);
    isTransitioning = false;
    nextTrackId = null;
    return;
  } else {
    currentTrackId = fadeInId;
    if (currentSectionTracks) {
      currentTrackIndexInSection = currentSectionTracks.indexOf(fadeInId);
    }
  }

  const fadeInGainNode = tracks.get(fadeInId)?.gainNode;
  if (!fadeInGainNode) {
    console.error(`performCrossfade: GainNode for fadeInId ${fadeInId} not found after playTrack. Aborting.`);
    gOut.cancelScheduledValues(audioContext.currentTime);
    gOut.linearRampToValueAtTime(1, audioContext.currentTime + 0.2);
    stopTrackInternal(fadeInId);
    isTransitioning = false;
    nextTrackId = null;
    return;
  }

  // ---------- fade-IN ramp ----------
  const gIn = fadeInGainNode.gain;
  gIn.setValueAtTime(0, audioContext.currentTime);
  gIn.linearRampToValueAtTime(0, transitionStartTime);
  gIn.linearRampToValueAtTime(1, fadeEnd);

  // Hand-off immediately so pause / resume target the audible track
  currentTrackId = fadeInId;
  if (currentSectionTracks) {
    currentTrackIndexInSection = currentSectionTracks.indexOf(fadeInId);
  }

  const trackData = tracks.get(fadeInId);
  announceSongTransition(trackData);

  // ---------- unified clean-up helper ----------
  const finishCrossfade = () => {
    if (!isTransitioning) return; // already cleaned once
    // Handle cleanup for same-track vs different-track crossfades
    if (fadeOutId !== fadeInId) {
      stopTrackInternal(fadeOutId);
    } else {
      // For same-track crossfades, manually clean up the old source node
      if (oldSourceNode) {
        liveSources.delete(oldSourceNode);
        oldSourceNode.onended = null;
        try {
          oldSourceNode.stop();
        } catch {
          /* empty */
        }
        try {
          oldSourceNode.disconnect();
        } catch {
          /* empty */
        }
      }
      if (oldGainNode) {
        try {
          oldGainNode.disconnect();
        } catch {
          /* empty */
        }
      }
    }

    if (pendingSectionTracks !== undefined) {
      console.log(`Crossfade complete: Applying pending section: ${pendingSectionTracks ? "[" + pendingSectionTracks.join(", ") + "]" : "None"}`);
      currentSectionTracks = pendingSectionTracks ? [...pendingSectionTracks] : null;
      pendingSectionTracks = undefined;
      dispatchPlaylistChangeEvent().catch(console.error);
    }

    if (currentSectionTracks) {
      currentTrackIndexInSection = currentSectionTracks.indexOf(fadeInId);
      if (currentTrackIndexInSection === -1) {
        console.warn(`Crossfade complete: Track ${fadeInId} NOT found in active section [${currentSectionTracks.join(", ")}].`);
      } else {
        console.log(`Crossfade complete. Now playing '${fadeInId}' (index ${currentTrackIndexInSection} in section [${currentSectionTracks.join(", ")}]).`);
      }
    } else {
      currentTrackIndexInSection = -1;
      console.log(`Crossfade complete. Now playing '${fadeInId}' (no active section).`);
    }

    nextTrackId = null;
    isTransitioning = false;
    console.log("Crossfade transition fully completed and state updated.");
  };

  // 1) call finishCrossfade as soon as the ramp mathematically ends
  const msUntilFadeEnd = Math.max(0, fadeEnd - audioContext.currentTime) * 1000 + 50; // +50 ms cushion
  setTimeout(finishCrossfade, msUntilFadeEnd);

  // 2) …and also if the old source ends earlier for any reason
  const sourceNodeToWatch = fadeOutId === fadeInId ? oldSourceNode : fadeOutState.sourceNode;
  if (sourceNodeToWatch) {
    sourceNodeToWatch.onended = finishCrossfade;
  }
}

export function setActiveSection(newSectionTrackIds: string[] | null): void {
  if (!audioContext) {
    console.log("setActiveSection: No audio context, saving as pending change");
    pendingSectionTracks = newSectionTrackIds;
    return;
  }

  if (isTransitioning) {
    const newPendingKey = newSectionTrackIds ? newSectionTrackIds.join(",") : "null";
    const currentPendingKeyIsUndefined = pendingSectionTracks === undefined;
    const currentPendingKeyValue = currentPendingKeyIsUndefined ? "undefined" : pendingSectionTracks === null ? "null" : pendingSectionTracks.join(",");

    if (newPendingKey !== currentPendingKeyValue) {
      console.log(
        `setActiveSection: Deferring section change. New pending: [${newSectionTrackIds ? newSectionTrackIds.join(", ") : "null"}]. Current pending was: ${currentPendingKeyValue}`,
      );
      pendingSectionTracks = newSectionTrackIds ? [...newSectionTrackIds] : null;
    } else {
      // console.log("setActiveSection: Deferring, but requested section is same as pending. No change to pendingSectionTracks.");
    }

    return;
  }

  // Not transitioning, apply immediately and clear any pending definition.
  console.log("setActiveSection: Applying change immediately, clearing any pending definition.");
  pendingSectionTracks = undefined;

  const newSectionKey = newSectionTrackIds ? newSectionTrackIds.join(",") : "null";
  const oldSectionKey = currentSectionTracks ? currentSectionTracks.join(",") : "null";

  if (newSectionKey === oldSectionKey) {
    console.log("setActiveSection: New section is the same as current, no change needed");
    return;
  }

  console.log(`Setting active section directly: ${newSectionTrackIds ? `[${newSectionTrackIds.join(", ")}]` : "None"}`);
  currentSectionTracks = newSectionTrackIds ? [...newSectionTrackIds] : null;

  dispatchPlaylistChangeEvent().catch(console.error);

  if (currentTrackId && currentSectionTracks && currentSectionTracks.includes(currentTrackId)) {
    currentTrackIndexInSection = currentSectionTracks.indexOf(currentTrackId);
    console.log(`setActiveSection: Current track '${currentTrackId}' is in new section at index ${currentTrackIndexInSection}`);
  } else {
    if (currentTrackId && currentSectionTracks && !currentSectionTracks.includes(currentTrackId)) {
      console.log(`Active section updated. Current track '${currentTrackId}' is NOT part of new section [${currentSectionTracks.join(", ")}]. Index reset.`);
    } else if (currentTrackId && !currentSectionTracks) {
      console.log(`Active section cleared. Current track '${currentTrackId}' no longer in a section. Index reset.`);
    } else if (!currentTrackId && currentSectionTracks) {
      // console.log(`Active section set to [${currentSectionTracks.join(", ")}]. No current track. Index reset.`);
    } else {
      // console.log("Active section updated/cleared. No current track or section unchanged regarding current track. Index reset.");
    }
    currentTrackIndexInSection = -1;
    console.log("setActiveSection: Current track is not in new section or no current track");
  }
}

export function isCurrentTrackInSection(sectionTrackIdsToCheck: string[]): boolean {
  if (!currentTrackId || !currentSectionTracks || !sectionTrackIdsToCheck) {
    return false;
  }
  const isActiveSectionSameAsChecked =
    currentSectionTracks.length === sectionTrackIdsToCheck.length && currentSectionTracks.every((track, index) => track === sectionTrackIdsToCheck[index]);

  if (!isActiveSectionSameAsChecked) {
    return false;
  }
  return currentSectionTracks.includes(currentTrackId);
}

export async function startFirstTrack(trackId: string): Promise<boolean> {
  if (!audioContext) {
    console.error("startFirstTrack: AudioContext not ready.");
    return false;
  }
  const currentTrackState = currentTrackId ? tracks.get(currentTrackId) : null;
  if ((currentTrackId && currentTrackState?.sourceNode) || isTransitioning) {
    console.warn(
      `startFirstTrack: Cannot start '${trackId}'. Reason: ${currentTrackId && currentTrackState?.sourceNode ? `already playing '${currentTrackId}' (source exists)` : ""}${isTransitioning ? "transition in progress" : ""}.`,
    );
    return false;
  }

  if (!tracks.has(trackId) || !tracks.get(trackId)!.audioBuffer) {
    console.log(`startFirstTrack: '${trackId}' not loaded. Attempting to load...`);
    const loaded = await loadTrack(trackId);
    if (!loaded) {
      console.error(`startFirstTrack: Failed to load '${trackId}' on demand.`);
      return false;
    }
    console.log(`startFirstTrack: Successfully loaded '${trackId}' on demand.`);
  }

  if (backgroundGainNode) {
    setBackgroundVolume(backgroundGainNode.gain.value, false);
  }

  console.log(`Starting first track: ${trackId}`);
  if (playTrack(trackId, audioContext.currentTime, 0)) {
    currentTrackId = trackId;
    if (currentSectionTracks) {
      currentTrackIndexInSection = currentSectionTracks.indexOf(trackId);
      if (currentTrackIndexInSection === -1) {
        console.warn(
          `Started track ${trackId}, but it's NOT in the current active section [${currentSectionTracks.join(", ")}]. Section state may be inconsistent or section not set yet for this track.`,
        );
      } else {
        console.log(`Started track ${trackId} at index ${currentTrackIndexInSection} in section [${currentSectionTracks.join(", ")}].`);
      }
    } else {
      currentTrackIndexInSection = -1;
      console.log(`Started track ${trackId} (no active section).`);
    }

    const trackData = tracks.get(trackId);
    announceSongTransition(trackData);
    return true;
  } else {
    console.warn(`startFirstTrack: playTrack call failed for ${trackId}.`);
    return false;
  }
}

export async function transitionToTrack(targetId: string): Promise<boolean> {
  console.log(`transitionToTrack: Attempting to transition to targetId='${targetId}'. Current: '${currentTrackId}', Transitioning: ${isTransitioning}, Next: '${nextTrackId}'`);
  if (!audioContext) {
    console.error("transitionToTrack: AudioContext not ready.");
    return false;
  }

  if (isTransitioning) {
    if (nextTrackId === targetId) {
      console.log(`transitionToTrack: Already transitioning to '${targetId}'. Considered successful.`);
      return true;
    } else {
      console.warn(`transitionToTrack: Cannot transition to '${targetId}', another transition (to '${nextTrackId}') is already in progress.`);
      return false;
    }
  }

  // --- Allow looping/restarting the same track if it's the only one in the playlist ---
  const isSingleTrackSection = currentSectionTracks && currentSectionTracks.length === 1 && currentSectionTracks[0] === targetId;
  if (currentTrackId === targetId && tracks.get(targetId)?.sourceNode && !isSingleTrackSection) {
    console.log(`transitionToTrack: Target track '${targetId}' is already current and playing. Ensuring index is correct.`);
    if (currentSectionTracks && currentTrackIndexInSection === -1) {
      currentTrackIndexInSection = currentSectionTracks.indexOf(targetId);
    }
    return true;
  }

  if (!tracks.has(targetId) || !tracks.get(targetId)!.audioBuffer) {
    console.log(`transitionToTrack: Target track '${targetId}' not loaded. Attempting to load...`);
    const loaded = await loadTrack(targetId);
    if (!loaded) {
      console.error(`transitionToTrack: Failed to load '${targetId}' on demand for transition.`);
      return false;
    }
    console.log(`transitionToTrack: Successfully loaded '${targetId}' on demand.`);
  }

  const currentTrackState = currentTrackId ? tracks.get(currentTrackId) : null;
  if (!currentTrackId || !currentTrackState?.sourceNode) {
    console.log(`transitionToTrack: No current track playing or source gone ('${currentTrackId}'). Using startFirstTrack for '${targetId}'.`);
    currentTrackId = null;
    currentTrackIndexInSection = -1;
    return await startFirstTrack(targetId);
  }

  const transitionPointTime = findNextTransitionPoint(currentTrackId);
  if (transitionPointTime === null) {
    console.warn(`transitionToTrack: Could not find a transition point for '${currentTrackId}'. Falling back to immediate cut to '${targetId}'.`);
    const oldTrackId = currentTrackId;
    stopTrackInternal(currentTrackId);
    currentTrackId = null;
    currentTrackIndexInSection = -1;

    const started = await startFirstTrack(targetId);
    if (started) {
      console.log(`transitionToTrack: Immediate cut from '${oldTrackId}' to '${targetId}' succeeded.`);
    } else {
      console.warn(`transitionToTrack: Immediate cut from '${oldTrackId}', but failed to start '${targetId}'.`);
    }
    return started;
  }

  console.log(`transitionToTrack: Initiating crossfade from '${currentTrackId}' to '${targetId}' scheduled at ${transitionPointTime.toFixed(2)}s`);
  await performCrossfade(currentTrackId, targetId, transitionPointTime);
  return true;
}

export function stopAllPlayback() {
  if (!audioContext) return;
  console.log("Stopping all playback and resetting state...");

  liveSources.forEach((src) => {
    try {
      src.stop();
    } catch {
      /* */
    }
    try {
      src.disconnect();
    } catch {
      /* */
    }
  });
  liveSources.clear();

  tracks.forEach((_, id) => {
    stopTrackInternal(id);
  });

  currentTrackId = null;
  nextTrackId = null;
  isTransitioning = false;
  currentSectionTracks = null;
  currentTrackIndexInSection = -1;
  pendingSectionTracks = undefined;
  dispatchPlaylistChangeEvent().catch(console.error);

  console.log("All playback stopped and state reset.");
}

// --- Getters ---
export function getCurrentTrackId(): string | null {
  return currentTrackId;
}
export function getNextTrackId(): string | null {
  return nextTrackId;
}
export function isCurrentlyTransitioning(): boolean {
  return isTransitioning;
}
export function getCurrentSectionTracks(): string[] | null {
  return currentSectionTracks ? [...currentSectionTracks] : null;
}
export function getCurrentTrackIndexInSection(): number {
  return currentTrackIndexInSection;
}

/** Pure getter for current playback position (in seconds) */
export function getCurrentTrackPosition(): number | null {
  // Early returns for performance
  if (!audioContext || !currentTrackId) return null;

  // Check if AudioContext is in a valid state
  if (audioContext.state !== "running") {
    return null;
  }

  const state = tracks.get(currentTrackId);
  if (!state) return null;

  // If paused, return the paused position immediately
  if (state.pausedAt != null) return state.pausedAt;

  // If no start time recorded, return 0
  if (state.startedAtCtxTime == null) return 0;

  // Calculate current position
  const pos = audioContext.currentTime - state.startedAtCtxTime + (state.offsetAtStart ?? 0);
  return Math.min(pos, state.audioBuffer?.duration ?? Infinity);
}

export function setCurrentTrackPosition(position: number): boolean {
  if (!audioContext || !currentTrackId) return false;
  const state = tracks.get(currentTrackId);
  if (!state || !state.audioBuffer) return false;

  // Clamp position to valid range
  const safePosition = Math.max(0, Math.min(position, state.audioBuffer.duration));

  try {
    const wasPlaying = state.sourceNode !== null;
    stopTrackInternal(currentTrackId);

    // If it was playing, start a new instance at the specified position
    if (wasPlaying) {
      playTrack(currentTrackId, audioContext.currentTime, safePosition);
    } else {
      // If it was paused, update the pausedAt value
      state.pausedAt = safePosition;
    }
    return true;
  } catch (e) {
    console.error("Error setting track position:", e);
    return false;
  }
}

// --- Volume control functions ---
/**
 * Get the current master volume level (0.0 to 1.0)
 * @returns Current volume as a number between 0 and 1, or null if audio context is not initialized
 */
export function getMasterVolume(): number | null {
  if (!audioContext || !masterGainNode) {
    return null;
  }
  const scaledVolume = masterGainNode.gain.value;
  // Reverse the non-linear scaling to get the linear value for the UI slider
  const linearVolume = Math.pow(scaledVolume, 1 / VOLUME_SCALE);
  return linearVolume;
}

/**
 * Set the master volume level
 * @param volume Volume level between 0.0 (silent) and 1.0 (full volume)
 * @returns Whether the operation was successful
 */
export function setMasterVolume(volume: number): boolean {
  if (!audioContext || !masterGainNode) {
    return false;
  }

  // Clamp volume between 0 and 1
  const safeVolume = Math.max(0, Math.min(1, volume));

  // Apply a non-linear scale to make the volume control more perceptual.
  // This makes the lower end of the slider have a finer control.
  // The value 1.737 is chosen so that a slider value of 0.5 corresponds to a gain of ~0.3.
  const scaledVolume = Math.pow(safeVolume, VOLUME_SCALE);

  try {
    masterGainNode.gain.value = scaledVolume;
    return true;
  } catch (e) {
    console.error("Error setting master volume:", e);
    return false;
  }
}

/**
 * Get the audiobook gain node for external connection
 * @returns The audiobook gain node or null if not initialized
 */
export function getAudiobookGainNode(): GainNode | null {
  return audiobookGainNode;
}

/**
 * Set the balance between background music and audiobook narration
 * @param volume Background volume level between 0.0 and 1.0
 *        1.0 = 100% background music, 0% audiobook
 *        0.5 = 50% each (default)
 * @param isUserAction Whether this is a user-initiated action (true) or automatic transition (false)
 * @returns Whether the operation was successful
 */
export function setBackgroundVolume(volume: number, isUserAction: boolean = true): boolean {
  if (!audioContext || !backgroundGainNode || !audiobookGainNode) {
    return false;
  }

  // Clamp input between 0 and 1
  const safeVolume = Math.max(0, Math.min(1, volume));

  try {
    backgroundGainNode.gain.value = safeVolume;
    audiobookGainNode.gain.value = 1 - safeVolume;

    // Only stop the audiobook if this is a user action or volume is 100% background
    if (isUserAction || safeVolume === 1.0) {
      const event = new CustomEvent("audiobookShouldStop", { detail: { backgroundVolume: safeVolume } });
      window.dispatchEvent(event);
    }

    return true;
  } catch (e) {
    console.error("Error setting background/audiobook balance:", e);
    return false;
  }
}

// --- Pause / Resume helpers ---
export function pauseCurrentTrack(): void {
  if (!audioContext) return;
  // remember position of the one we want to resume
  if (currentTrackId) {
    const s = tracks.get(currentTrackId);
    if (s?.sourceNode) s.pausedAt = audioContext.currentTime - (s.startedAtCtxTime ?? 0) + (s.offsetAtStart ?? 0);
  }

  // stop every active source so nothing keeps playing
  tracks.forEach((_, id) => stopTrackInternal(id));
}

export function resumeCurrentTrack(): void {
  if (!audioContext || !currentTrackId) return;
  const s = tracks.get(currentTrackId);
  if (!s || s.pausedAt == null) return;
  playTrack(currentTrackId, audioContext.currentTime, s.pausedAt);
}

async function dispatchPlaylistChangeEvent(trackIds: string[] | null = null) {
  const tracksToDispatch = trackIds || currentSectionTracks;

  // Helper to create playlist data from a list of track IDs
  const createPlaylistData = (ids: string[]) => {
    return ids.map((id) => {
      const trackState = tracks.get(id);
      if (trackState && trackState.audioBuffer) {
        const title = trackState.title || id;
        const duration = !isNaN(trackState.trackLength) ? trackState.trackLength : 0;
        return { id, title, duration };
      }
      return { id, title: id, duration: 0 }; // Default for unloaded tracks
    });
  };

  if (tracksToDispatch && tracksToDispatch.length > 0) {
    // First pass: Dispatch immediately with what we have
    const initialPlaylistData = createPlaylistData(tracksToDispatch);
    window.dispatchEvent(new CustomEvent("playlistChange", { detail: initialPlaylistData }));

    // Second pass: Load missing tracks progressively
    const tracksToLoad = tracksToDispatch.filter((id) => {
      const trackState = tracks.get(id);
      return !trackState || !trackState.audioBuffer;
    });

    if (tracksToLoad.length > 0) {
      const loadTrackWithDelay = async (id: string, index: number) => {
        // Stagger the requests slightly to avoid overwhelming the system
        await new Promise((resolve) => setTimeout(resolve, index * PLAYLIST_LOAD_STAGGER_MS));

        try {
          if (await loadTrack(id)) {
            if (playlistUpdateTimeout) {
              clearTimeout(playlistUpdateTimeout);
            }

            playlistUpdateTimeout = setTimeout(() => {
              try {
                // Check if the section has changed since loading started.
                // This prevents a race condition where a new section is selected, but an update for the old one
                // arrives later and incorrectly overwrites the UI.
                const currentTracksKey = currentSectionTracks?.join(",") ?? null;
                const dispatchTracksKey = tracksToDispatch.join(",");

                if (currentTracksKey !== dispatchTracksKey) {
                  return; // Abort update for stale playlist
                }

                const updatedPlaylistData = createPlaylistData(tracksToDispatch);
                window.dispatchEvent(new CustomEvent("playlistChange", { detail: updatedPlaylistData }));
              } catch (error) {
                console.error("Error during debounced playlist update:", error);
              }
            }, PLAYLIST_UPDATE_DEBOUNCE_MS);
          }
        } catch (error) {
          console.warn(`Failed to load track ${id} for playlist:`, error);
        }
      };

      // Start loading tracks progressively
      tracksToLoad.forEach(loadTrackWithDelay);
    }

    return; // Early return since we already dispatched
  }

  // No tracks case
  console.log("Dispatching playlist change event with track data:", null);
  window.dispatchEvent(new CustomEvent("playlistChange", { detail: null }));
}

// Listen for splash screen hiding event to trigger initial playlist change
window.addEventListener("splashHidden", () => {
  setTimeout(() => {
    const currentTracks = getCurrentSectionTracks();
    if (currentTracks && currentTracks.length > 0) {
      dispatchPlaylistChangeEvent(currentTracks).catch(console.error);
    } else {
      dispatchPlaylistChangeEvent(null).catch(console.error);
    }
  }, 2000);
});

// Add TypeScript declarations for window properties
declare global {
  interface Window {
    setMasterVolume: typeof setMasterVolume;
    getMasterVolume: typeof getMasterVolume;
    setBackgroundVolume: typeof setBackgroundVolume;
    getCurrentTrackData: typeof getCurrentTrackData;
    getCurrentTrackPosition: typeof getCurrentTrackPosition;
    setCurrentTrackPosition: typeof setCurrentTrackPosition;
    pauseCurrentTrack: typeof pauseCurrentTrack;
    resumeCurrentTrack: typeof resumeCurrentTrack;
  }

  interface WindowEventMap {
    playlistChange: CustomEvent<{ id: string; title: string; duration: number }[] | null>;
    songTransition: CustomEvent<TrackState | null>;
    trackPartiallyLoaded: CustomEvent<{ trackId: string; partialDuration: number; estimatedTotal: number }>;
    trackFullyLoaded: CustomEvent<{ trackId: string; fullDuration: number }>;
  }
}

window.setMasterVolume = setMasterVolume;
window.getMasterVolume = getMasterVolume;
window.setBackgroundVolume = setBackgroundVolume;
window.getCurrentTrackData = getCurrentTrackData;
window.getCurrentTrackPosition = getCurrentTrackPosition;
window.setCurrentTrackPosition = setCurrentTrackPosition;
window.pauseCurrentTrack = pauseCurrentTrack;
window.resumeCurrentTrack = resumeCurrentTrack;
