import { CURRENT_BOOK } from "./consts";

// --- Interfaces and Types ---
interface TrackState {
  transitionPoints?: number[];
  audioBuffer?: AudioBuffer;
  sourceNode?: AudioBufferSourceNode | null;
  gainNode?: GainNode | null;
  duration?: number; // Added for pre-emptive transition
  preemptiveTransitionTimeout?: ReturnType<typeof setTimeout> | null; // Added for managing pre-emptive transition
}

// --- Configuration ---
const FADE_DURATION_SECONDS = 8.0;
const PRE_END_TRANSITION_TRIGGER_SECONDS = 4.0; // Time before track end to trigger transition

// --- Module-level State ---
let audioContext: AudioContext | null = null;
const tracks: Map<string, TrackState> = new Map();

let currentTrackId: string | null = null;
let nextTrackId: string | null = null; // Track being faded TO (during active crossfade)
let isTransitioning = false; // Is a crossfade actively happening?
let transitionTimeout: ReturnType<typeof setTimeout> | null = null;

let currentSectionTracks: string[] | null = null;
let currentTrackIndexInSection: number = -1;
// undefined: no pending change; null: pending clear; string[]: pending set
let pendingSectionTracks: string[] | null | undefined = undefined;

// --- Core Functions ---

export function getAudioContext(): AudioContext | null {
  return audioContext;
}

export function initAudioContext(): boolean {
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
      if (audioContext.state === "suspended") {
        audioContext.resume().then(
          () => console.log("AudioContext resumed on init."),
          (e) => console.error("Failed to resume AudioContext on init:", e),
        );
      }
    } catch (e) {
      console.error("Error creating AudioContext:", e);
      return false;
    }
  } else if (audioContext.state === "suspended") {
    audioContext.resume().catch((e) => console.error("Error resuming existing AudioContext:", e));
  }
  return audioContext?.state === "running";
}

export async function loadTrack(trackId: string, transitionPoints?: number[]): Promise<boolean> {
  if (!audioContext) {
    if (!initAudioContext()) {
      console.error("loadTrack: AudioContext could not be initialized/resumed. Cannot load track.");
      return false;
    }
  }
  if (audioContext!.state !== "running") {
    // audioContext is guaranteed to be non-null here
    console.warn("loadTrack: AudioContext is not running. Loading may succeed but playback won't start yet.");
    // await audioContext!.resume().catch((e) => console.error("Error resuming AudioContext before load:", e));
    // Resuming here might be too late if the user gesture is already "spent". initAudioContext should handle it.
  }

  const existing = tracks.get(trackId);
  if (existing?.audioBuffer) {
    if (transitionPoints && existing.transitionPoints !== transitionPoints) {
      existing.transitionPoints = transitionPoints;
    }
    // console.log(`Track '${trackId}' already loaded.`);
    return true;
  }

  const audioPath = `/${CURRENT_BOOK}/${trackId}.mp3`;
  console.log(`Loading '${trackId}' from ${audioPath}...`);
  try {
    const response = await fetch(audioPath);
    if (!response.ok) throw new Error(`HTTP ${response.status} – ${response.statusText}`);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioContext!.decodeAudioData(arrayBuffer);
    tracks.set(trackId, { audioBuffer, duration: audioBuffer.duration, transitionPoints, sourceNode: null, gainNode: null });
    console.log(`Decoded '${trackId}'. Duration: ${audioBuffer.duration.toFixed(2)}s.` + (transitionPoints ? ` Transition points: ${transitionPoints.join(", ")}` : ""));
    return true;
  } catch (e) {
    console.error(`Error loading '${trackId}':`, e);
    tracks.delete(trackId);
    return false;
  }
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

  stopTrackInternal(trackId); // Stop any previous instance of this specific track

  const source = audioContext.createBufferSource();
  const gainNode = audioContext.createGain();
  source.buffer = state.audioBuffer;
  source.loop = false; // onended will handle sequence
  gainNode.gain.setValueAtTime(startTime <= audioContext.currentTime ? 1 : 0, startTime);
  source.connect(gainNode).connect(audioContext.destination);

  // Clear any existing preemptive transition timeout for this track if it's being re-played
  const existingStateForTimeout = tracks.get(trackId);
  if (existingStateForTimeout?.preemptiveTransitionTimeout) {
    clearTimeout(existingStateForTimeout.preemptiveTransitionTimeout);
    existingStateForTimeout.preemptiveTransitionTimeout = null;
  }

  source.onended = async () => {
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
    state.sourceNode.onended = null; // Crucial: remove handler before stopping
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
      currentTrackId = previousTrackId; // Rollback
      currentTrackIndexInSection = previousIndex;
      // Consider stopping all if sequence play fails catastrophically
      // stopAllPlayback();
    } else {
      console.log(`playNextTrackInSection: Successfully started next track '${nextTrackIdToPlay}'.`);
    }
  } else {
    console.error(`playNextTrackInSection: Cannot play next track '${nextTrackIdToPlay}'. Load failed: ${!loaded}, Context not running: ${audioContext?.state !== "running"}.`);
    // Don't roll back currentTrackId/Index here, as they weren't updated for the new track
    // If loading failed, the previous track effectively "ended" and nothing new started.
    // The onended handler for the previous track should have already cleared currentTrackId if applicable.
    // If we want to be super safe, and loading the next track fails, we could stop everything.
    // stopAllPlayback();
  }
}

function findNextTransitionPoint(trackIdForFadeOut: string): number | null {
  if (!audioContext) return null;
  const state = tracks.get(trackIdForFadeOut);
  if (!state?.sourceNode || !state.audioBuffer || !state.gainNode || state.gainNode.gain.value === 0) {
    console.warn(`findNextTransitionPoint: No valid source/buffer/gain for '${trackIdForFadeOut}' or gain is 0. Cannot determine transition point.`);
    return null;
  }
  // console.warn(`Using fixed transition delay for '${trackIdForFadeOut}' for testing.`);
  return audioContext.currentTime + 1.0; // Simplified: start fade 1 second from now
}

async function performCrossfade(fadeOutId: string, fadeInId: string, transitionStartTime: number) {
  if (!audioContext) {
    console.warn("performCrossfade: AudioContext not available.");
    isTransitioning = false; // Ensure this is reset if we bail early
    nextTrackId = null;
    return;
  }

  const fadeOutState = tracks.get(fadeOutId);
  const fadeInStateExists = tracks.has(fadeInId) && tracks.get(fadeInId)!.audioBuffer; // Check buffer specifically

  if (!fadeOutState?.gainNode || !fadeInStateExists) {
    console.error(`performCrossfade: Missing data. FadeOutGain: ${!!fadeOutState?.gainNode}, FadeInBuffer: ${fadeInStateExists}. Cannot cross-fade ${fadeOutId} -> ${fadeInId}.`);
    isTransitioning = false;
    nextTrackId = null;
    return;
  }

  console.log(`Performing crossfade: ${fadeOutId} -> ${fadeInId} scheduled at ${transitionStartTime.toFixed(2)}s`);
  isTransitioning = true;
  nextTrackId = fadeInId; // Mark the track we are fading *to*

  const fadeEnd = transitionStartTime + FADE_DURATION_SECONDS;

  // Fade Out
  const gOut = fadeOutState.gainNode.gain;
  gOut.cancelScheduledValues(audioContext.currentTime);
  gOut.setValueAtTime(gOut.value, audioContext.currentTime);
  gOut.linearRampToValueAtTime(0, fadeEnd);

  // Fade In - Ensure track is loaded before scheduling play
  // `transitionToTrack` should have pre-loaded it. This is a safety check.
  const loaded = await loadTrack(fadeInId);
  if (!loaded) {
    console.error(`performCrossfade: Failed to ensure ${fadeInId} is loaded. Aborting crossfade.`);
    gOut.cancelScheduledValues(audioContext.currentTime); // Cancel the fade out
    gOut.linearRampToValueAtTime(1, audioContext.currentTime + 0.2); // Quick ramp back up
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
  const gIn = fadeInGainNode.gain;
  // Ensure it starts silent IF scheduled in future, or from 0 if starting now due to scheduling quirks
  gIn.setValueAtTime(0, audioContext.currentTime); // Set to 0 now
  gIn.linearRampToValueAtTime(0, transitionStartTime); // Ensure it stays 0 until transitionStartTime
  gIn.linearRampToValueAtTime(1, fadeEnd); // Then ramp up

  // Cleanup Timeout
  if (transitionTimeout) clearTimeout(transitionTimeout);
  transitionTimeout = setTimeout(
    () => {
      console.log(`Crossfade timeout reached for ${fadeOutId} -> ${fadeInId}. Cleaning up.`);
      stopTrackInternal(fadeOutId);

      currentTrackId = fadeInId; // fadeInId is now officially the current track

      // Apply pending section if one was set during the transition
      if (pendingSectionTracks !== undefined) {
        console.log(`Crossfade complete: Applying pending section: ${pendingSectionTracks ? "[" + pendingSectionTracks.join(", ") + "]" : "None"}`);
        currentSectionTracks = pendingSectionTracks ? [...pendingSectionTracks] : null;
        pendingSectionTracks = undefined; // Reset pending state
      }

      // Update index based on the (potentially new) current section
      if (currentSectionTracks) {
        currentTrackIndexInSection = currentSectionTracks.indexOf(fadeInId);
        if (currentTrackIndexInSection === -1) {
          console.warn(
            `Crossfade complete: Track ${fadeInId} NOT found in active section [${currentSectionTracks.join(", ")}]. This might indicate a state issue if the section was expected to contain this track.`,
          );
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
    },
    Math.max(0, fadeEnd - audioContext.currentTime) * 1000 + 100,
  ); // 100ms buffer
}

export function setActiveSection(newSectionTrackIds: string[] | null): void {
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
    // console.log(`isCurrentTrackInSection: Provided section [${sectionTrackIdsToCheck.join(',')}] does not match active internal section [${currentSectionTracks.join(',')}]`);
    return false;
  }
  return currentSectionTracks.includes(currentTrackId);
}

export async function startFirstTrack(trackId: string): Promise<boolean> {
  if (!audioContext) {
    console.error("startFirstTrack: AudioContext not ready.");
    return false;
  }
  // This check for currentTrackId MUST allow starting if currentTrackId is set but refers to a track that has naturally ended.
  // The key is `tracks.get(currentTrackId)?.sourceNode` being null.
  const currentTrackState = currentTrackId ? tracks.get(currentTrackId) : null;
  if ((currentTrackId && currentTrackState?.sourceNode) || isTransitioning) {
    // Check if sourceNode exists
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
    // Also check if sourceNode exists
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
      return false; // Failed to load, cannot proceed.
    }
    console.log(`transitionToTrack: Successfully loaded '${targetId}' on demand.`);
  }

  // Case 1: Nothing is effectively playing (no currentTrackId, or currentTrackId's sourceNode is gone)
  const currentTrackState = currentTrackId ? tracks.get(currentTrackId) : null;
  if (!currentTrackId || !currentTrackState?.sourceNode) {
    console.log(`transitionToTrack: No current track playing or source gone ('${currentTrackId}'). Using startFirstTrack for '${targetId}'.`);
    currentTrackId = null; // Ensure it's null if source was gone
    currentTrackIndexInSection = -1;
    return await startFirstTrack(targetId);
  }

  // Case 2: Current track is different, need to transition.
  const transitionPointTime = findNextTransitionPoint(currentTrackId);
  if (transitionPointTime === null) {
    console.warn(`transitionToTrack: Could not find a transition point for '${currentTrackId}'. Falling back to immediate cut to '${targetId}'.`);
    const oldTrackId = currentTrackId;
    stopTrackInternal(currentTrackId); // Stop the current one
    currentTrackId = null; // CRITICAL: Clear currentTrackId before calling startFirstTrack
    currentTrackIndexInSection = -1; // Reset index

    const started = await startFirstTrack(targetId); // Attempt to start the new one
    if (started) {
      console.log(`transitionToTrack: Immediate cut from '${oldTrackId}' to '${targetId}' succeeded.`);
    } else {
      console.warn(`transitionToTrack: Immediate cut from '${oldTrackId}', but failed to start '${targetId}'.`);
      // currentTrackId is already null, which is correct state if target didn't start.
    }
    return started;
  }

  console.log(`transitionToTrack: Initiating crossfade from '${currentTrackId}' to '${targetId}' scheduled at ${transitionPointTime.toFixed(2)}s`);
  await performCrossfade(currentTrackId, targetId, transitionPointTime); // performCrossfade is async due to await loadTrack inside
  return true; // Transition initiated (crossfade process is async)
}

export function stopAllPlayback() {
  if (!audioContext) return;
  console.log("Stopping all playback and resetting state...");
  if (transitionTimeout) clearTimeout(transitionTimeout);
  transitionTimeout = null;

  tracks.forEach((_, id) => {
    stopTrackInternal(id);
  });

  currentTrackId = null;
  nextTrackId = null;
  isTransitioning = false;
  currentSectionTracks = null;
  currentTrackIndexInSection = -1;
  pendingSectionTracks = undefined; // Clear any pending section changes

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
