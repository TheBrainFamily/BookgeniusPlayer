import { parseBlob } from "music-metadata";

import { CURRENT_BOOK } from "./consts";

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
// ToDo: Remove later, check why at the beginning, even though we should have info about tracks, we don't have them
let temporaryTracks: string[] = [];

export function getTrackDetailsById(id: string): TrackState | null {
  return tracks.get(id) || null;
}

export function getCurrentTrackData(): TrackState | null {
  console.log(`currentTrackId: ${currentTrackId}`);
  console.log(`tracks`, tracks);
  return tracks.get(currentTrackId) || null;
}

// --- Core Functions ---

export function getAudioContext(): AudioContext | null {
  return audioContext;
}

function announceSongTransition() {
  window.dispatchEvent(new CustomEvent("songTransition"));
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
      console.log(`AudioContext initialised. State: ${audioContext.state}`);
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

      // Set initial gains based on localStorage values
      masterGainNode.gain.value = isInitiallyMuted ? 0 : initialVolume;
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
  return `/${CURRENT_BOOK}/${trackId}.mp3`; // → /1984/background-forest.mp3
}
function isFetchOk(res: Response, url: string): boolean {
  const local = url.startsWith("/");
  return res.ok || (local && res.status === 0);
}

/* MAIN ------------------------------------------------------------------ */
export async function loadTrack(trackId: string, transitionPoints?: number[]): Promise<boolean> {
  /* 1 ▸ make sure AudioContext is alive ---------------------------- */
  if (!audioContext && !(await initAudioContext())) {
    console.error("loadTrack: AudioContext could not be initialised.");
    return false;
  }

  /* 2 ▸ cache hit? ------------------------------------------------- */
  const cached = tracks.get(trackId);
  if (cached?.audioBuffer) {
    if (transitionPoints && cached.transitionPoints !== transitionPoints) {
      cached.transitionPoints = transitionPoints;
    }
    return true;
  }

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

  /* 4 ▸ parse metadata & decode ----------------------------------- */
  let audioBuffer: AudioBuffer;
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

    /* ── 4b decode audio ─────────────────────────────────────────── */
    audioBuffer = await audioContext!.decodeAudioData(arrayBuffer);
  } catch (e) {
    console.error(`❌ metadata/decode error for '${trackId}':`, e);
    if (coverArtUrl) URL.revokeObjectURL(coverArtUrl);
    tracks.delete(trackId);
    return false;
  }

  /* 5 ▸ cache & done ---------------------------------------------- */
  tracks.set(trackId, { audioBuffer, duration: audioBuffer.duration, transitionPoints, sourceNode: null, gainNode: null, coverArtUrl, title, trackLength: audioBuffer.duration });

  console.log(`✅ Decoded '${trackId}' – ${audioBuffer.duration.toFixed(2)} s` + (transitionPoints ? ` | transitions: ${transitionPoints.join(", ")}` : ""));
  return true;
}

function playTrack(trackId: string, startTime: number = 0, offset: number = 0): boolean {
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

  stopTrackInternal(trackId); // Stop any previous instance of this specific track

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
    console.log(`Scheduled '${trackId}' @ ${startTime.toFixed(2)}s (offset ${offset.toFixed(2)}s). Duration: ${state.audioBuffer.duration.toFixed(2)}s`);

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
      announceSongTransition();
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

  if (!playTrack(fadeInId, transitionStartTime, 0)) {
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

  announceSongTransition();

  // ---------- unified clean-up helper ----------
  const finishCrossfade = () => {
    if (!isTransitioning) return; // already cleaned once
    stopTrackInternal(fadeOutId);

    if (pendingSectionTracks !== undefined) {
      console.log(`Crossfade complete: Applying pending section: ${pendingSectionTracks ? "[" + pendingSectionTracks.join(", ") + "]" : "None"}`);
      currentSectionTracks = pendingSectionTracks ? [...pendingSectionTracks] : null;
      pendingSectionTracks = undefined;
      dispatchPlaylistChangeEvent();
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
  fadeOutState.sourceNode!.onended = finishCrossfade;
}

export function setActiveSection(newSectionTrackIds: string[] | null): void {
  temporaryTracks = newSectionTrackIds || [];

  if (!audioContext) {
    console.warn("setActiveSection: AudioContext not ready.");
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
  // console.log("setActiveSection: Applying change immediately, clearing any pending definition.");
  pendingSectionTracks = undefined;

  const newSectionKey = newSectionTrackIds ? newSectionTrackIds.join(",") : "null";
  const oldSectionKey = currentSectionTracks ? currentSectionTracks.join(",") : "null";

  if (newSectionKey === oldSectionKey) {
    // console.log("setActiveSection: Section is the same as current, no change needed.");
    return; // No change needed
  }

  console.log(`Setting active section directly: ${newSectionTrackIds ? `[${newSectionTrackIds.join(", ")}]` : "None"}`);
  currentSectionTracks = newSectionTrackIds ? [...newSectionTrackIds] : null;
  dispatchPlaylistChangeEvent();

  if (currentTrackId && currentSectionTracks && currentSectionTracks.includes(currentTrackId)) {
    currentTrackIndexInSection = currentSectionTracks.indexOf(currentTrackId);
    console.log(`Active section updated. Current track '${currentTrackId}' (index ${currentTrackIndexInSection}) is part of new section.`);
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
    announceSongTransition();
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

  if (currentTrackId === targetId && tracks.get(targetId)?.sourceNode) {
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
  dispatchPlaylistChangeEvent();

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
  if (!audioContext || !currentTrackId) return null;
  const state = tracks.get(currentTrackId);
  if (!state) return null;
  if (state.pausedAt != null) return state.pausedAt;
  if (state.startedAtCtxTime == null) return 0;
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
  return masterGainNode.gain.value;
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

  try {
    masterGainNode.gain.value = safeVolume;
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

function dispatchPlaylistChangeEvent(tracks: string[] | null = null) {
  const detail: { tracks: string[] } = { tracks: [] };

  if (tracks) {
    detail.tracks = tracks;
  } else {
    detail.tracks = currentSectionTracks ? currentSectionTracks : [];
  }

  const event = new CustomEvent("playlistChange", { detail });
  window.dispatchEvent(event);
}

// Listen for splash screen hiding event to trigger initial playlist change
// There is a problem with deal-with-background-song, we do not have informations about tracks at the very first moment
window.addEventListener("splashHidden", () => {
  setTimeout(() => {
    dispatchPlaylistChangeEvent(temporaryTracks);
  }, 500);
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
    playlistChange: CustomEvent<{ tracks: string[] | null }>;
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
