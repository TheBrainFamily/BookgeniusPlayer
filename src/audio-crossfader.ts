import { CURRENT_BOOK } from "./consts";

// --- Interfaces and Types ---
interface TrackState {
  transitionPoints?: number[];
  audioBuffer?: AudioBuffer;
  sourceNode?: AudioBufferSourceNode | null;
  gainNode?: GainNode | null;
}

// --- Configuration ---
const FADE_DURATION_SECONDS = 8.0;
const MIN_LOOKAHEAD_SECONDS = 1.5;
const MAX_LOOKAHEAD_SECONDS = 15.0;

// --- Module-level State ---
let audioContext: AudioContext | null = null;
const tracks: Map<string, TrackState> = new Map();

let currentTrackId: string | null = null;
let nextTrackId: string | null = null; // Track being faded TO
let isTransitioning = false; // Is a crossfade actively happening?
let transitionTimeout: ReturnType<typeof setTimeout> | null = null;

// --- NEW State for Section Sequence ---
let currentSectionTracks: string[] | null = null; // List of track IDs for the current section
let currentTrackIndexInSection: number = -1; // Index of currentTrackId within currentSectionTracks
// ---

// --- Core Functions ---

export function initAudioContext(): boolean {
  // ... (initAudioContext function remains the same)
  if (!audioContext) {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) {
        console.error("Web Audio API not supported by this browser.");
        return false;
      }

      audioContext = new AudioContextClass();
      console.log("AudioContext initialised.");

      // Immediately try to resume if suspended (often needed initially)
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
    // If already exists but suspended, try resuming
    audioContext.resume().catch((e) => console.error("Error resuming existing AudioContext:", e));
  }

  return audioContext.state === "running";
}


export async function loadTrack(trackId: string, transitionPoints?: number[]): Promise<boolean> {
  // ... (loadTrack function remains largely the same)
  // Added check for AudioContext readiness at the start
  if (!audioContext) {
    if (!initAudioContext()) { // Attempt to init/resume if not ready
      console.error("AudioContext could not be initialized/resumed. Cannot load track.");
      return false;
    }
    // If initAudioContext succeeds, audioContext will be available now
  }
  // Ensure context is running after potential init attempt
  if (audioContext.state !== 'running') {
    console.warn("AudioContext is not running. Loading may succeed but playback won't start yet.");
    // Potentially try resuming again, though init should handle it.
    audioContext.resume().catch(e => console.error("Error resuming AudioContext before load:", e));
  }


  const existing = tracks.get(trackId);
  // ... (rest of the loading logic is the same)
  if (existing?.audioBuffer) {
    // Already decoded — just update transition points if new data supplied
    if (transitionPoints && existing.transitionPoints !== transitionPoints) {
      existing.transitionPoints = transitionPoints;
      console.log(`Updated transition points for '${trackId}'.`);
    }
    return true;
  }

  const audioPath = `/${CURRENT_BOOK}/${trackId}.mp3`;
  console.log(`Loading '${trackId}' → ${audioPath}`);

  try {
    const response = await fetch(audioPath);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} – ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    tracks.set(trackId, { audioBuffer, transitionPoints, sourceNode: null, gainNode: null });

    console.log(`Decoded '${trackId}'.` + (transitionPoints ? ` Transition points: ${transitionPoints.join(", ")}` : " No transition points supplied."));
    return true;
  } catch (e) {
    console.error(`Error loading '${trackId}':`, e);
    tracks.delete(trackId);
    return false;
  }
}


/**
 * Schedules / (re)starts a looping BufferSource for the given track.
 * Returns true on success.
 */
function playTrack(trackId: string, startTime: number = 0, offset: number = 0): boolean {
  if (!audioContext || audioContext.state !== 'running') {
    console.error(`Cannot play track '${trackId}', AudioContext not ready or not running.`);
    // Attempt to resume just in case
    initAudioContext();
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
  const beginGain = startTime <= audioContext.currentTime ? 1 : 0; // Start at full volume if starting now

  source.buffer = state.audioBuffer;
  source.loop = true; // Keep looping
  gainNode.gain.setValueAtTime(beginGain, startTime); // Set initial gain

  source.connect(gainNode).connect(audioContext.destination);

  // *** Add the onended handler ***
  source.onended = () => {
    // Check if this 'onended' event is for the *currently active* track
    // and if it ended *naturally* (i.e., not because we called .stop() during a transition or stopAll).
    const wasCurrentTrack = (trackId === currentTrackId);
    const stateStillExists = tracks.has(trackId) && tracks.get(trackId)?.sourceNode === source; // Check if sourceNode is still the same one

    if (wasCurrentTrack && !isTransitioning && stateStillExists && currentSectionTracks && currentSectionTracks.length > 0) {
      console.log(`Track '${trackId}' (index ${currentTrackIndexInSection}) ended naturally.`);
      // Only proceed if it was the current track and we are not in a crossfade
      playNextTrackInSection();
    } else {
      console.log(`Track '${trackId}' ended. Conditions not met for auto-play next (wasCurrent: ${wasCurrentTrack}, isTransitioning: ${isTransitioning}, stateExists: ${stateStillExists}, sectionTracks: ${!!currentSectionTracks})`);
      // Optional: Clean up if the node ended but wasn't the active track anymore?
      // stopTrackInternal(trackId); // Might be redundant if stopTrackInternal was called elsewhere
    }
  };

  try {
    source.start(startTime, offset % state.audioBuffer.duration);
    state.sourceNode = source;
    state.gainNode = gainNode;
    console.log(`Scheduled '${trackId}' @ ${startTime.toFixed(2)}s (offset ${offset.toFixed(2)}s).`);
    return true;
  } catch (err) {
    console.error(`Error starting source node for '${trackId}':`, err);
    stopTrackInternal(trackId); // Clean up nodes if start failed
    return false;
  }
}

/** Internal helper: stops and disconnects nodes for a track. */
function stopTrackInternal(trackId: string) {
  const state = tracks.get(trackId);
  if (!state) return;

  if (state.sourceNode) {
    // Remove onended handler before stopping to prevent triggering sequence logic incorrectly
    state.sourceNode.onended = null;
    try {
      state.sourceNode.stop();
    } catch (e) {
      // Ignore errors (e.g., if already stopped)
    }
    try {
      state.sourceNode.disconnect();
    } catch (e) {}
    state.sourceNode = null;
  }
  if (state.gainNode) {
    try {
      state.gainNode.disconnect();
    } catch (e) {}
    state.gainNode = null;
  }
  // console.log(`Stopped internal nodes for ${trackId}`); // Optional logging
}


/** Plays the next track in the current section sequence */
function playNextTrackInSection() {
  if (!currentSectionTracks || currentSectionTracks.length === 0 || isTransitioning || !audioContext) {
    console.log("playNextTrackInSection: Conditions not met (no section/tracks, transitioning, or no context).")
    return;
  }

  // Calculate next index, wrapping around
  const nextIndex = (currentTrackIndexInSection + 1) % currentSectionTracks.length;
  const nextTrackIdToPlay = currentSectionTracks[nextIndex];

  console.log(`Auto-playing next track in section: '${nextTrackIdToPlay}' (index ${nextIndex})`);

  const previousTrackId = currentTrackId; // Keep for potential rollback

  // Update state *before* playing
  currentTrackId = nextTrackIdToPlay; // Logically, this is now the current track
  currentTrackIndexInSection = nextIndex;

  // Immediately play the next track (no fade, it's a direct switch upon the previous one ending)
  loadTrack(nextTrackIdToPlay).then(loaded => { // Ensure loaded
    if (loaded && audioContext) {
      // Play immediately from the beginning (offset 0)
      if (!playTrack(nextTrackIdToPlay, audioContext.currentTime, 0)) {
        console.error(`Failed to play next track in sequence: ${nextTrackIdToPlay}`);
        // Rollback state? Stop all?
        currentTrackId = previousTrackId; // Revert logical track
        currentTrackIndexInSection = (nextIndex - 1 + currentSectionTracks.length) % currentSectionTracks.length; // Revert index
        stopAllPlayback(); // Safer to stop if sequence fails
      } else {
        console.log(`Successfully started next track in sequence: '${nextTrackIdToPlay}'`);
      }
    } else if (!loaded) {
      console.error(`Cannot play next track '${nextTrackIdToPlay}', failed to load.`);
      currentTrackId = previousTrackId; // Revert
      currentTrackIndexInSection = (nextIndex - 1 + currentSectionTracks.length) % currentSectionTracks.length;
      stopAllPlayback();
    }
  });
}

// --- findNextTransitionPoint function remains the same ---
// (Currently not used based on the prompt, but kept for potential future use)
function findNextTransitionPoint(trackId: string): number | null {
  if (!audioContext) return null;

  const state = tracks.get(trackId);
  // Ensure we check sourceNode *exists* and isn't already stopped/stopping
  if (!state?.sourceNode || !state.audioBuffer || !state.gainNode) return null;

  // *** SIMPLIFIED/TEMP: Return a fixed short delay for testing crossfades ***
  // Replace this with your actual transition point logic when ready
  console.warn(`Using fixed transition delay for '${trackId}'`);
  return audioContext.currentTime + 1.0; // Start fade 1 second from now

  /* // Your original logic (keep commented out if not using transition points yet)
  const points = state.transitionPoints;
  if (!points || points.length === 0) {
      console.warn(`No transition points for '${trackId}'. Cannot find transition point.`);
      return null; // No points defined, cannot find a time based on them
  }

  const now = audioContext.currentTime;
  // Calculate current playback position within the loop
  // This requires knowing when the current source *started* and the current time.
  // AudioBufferSourceNode doesn't expose playback position directly in a reliable way for looping.
  // This is a common challenge. A workaround involves tracking start time and offsets.
  // For simplicity, let's assume we can estimate loop position (THIS IS OFTEN INACCURATE).
  // A more robust solution might involve setting up a separate timer/requestAnimationFrame loop.
  // --- Placeholder for loop position calculation ---
   console.error("Accurate loop position calculation needed for findNextTransitionPoint!");
   const loopPos = now % state.audioBuffer.duration; // <<< HIGHLY APPROXIMATE

  // ... (rest of your original logic using `loopPos` and `points`)
  */
}


/** Cross-fades two tracks beginning at `transitionStartTime`. */
function performCrossfade(fadeOutId: string, fadeInId: string, transitionStartTime: number) {
  if (!audioContext || isTransitioning) {
    console.warn(`Cannot perform crossfade: Context issue (${!audioContext}) or already transitioning (${isTransitioning})`);
    return;
  }

  const fadeOutState = tracks.get(fadeOutId);
  const fadeInState = tracks.get(fadeInId); // We only need the buffer initially

  if (!fadeOutState?.gainNode || !fadeInState?.audioBuffer) {
    console.error(`Cannot perform cross-fade: missing data for ${fadeOutId} or ${fadeInId}.`);
    return;
  }

  console.log(`Performing crossfade: ${fadeOutId} -> ${fadeInId} starting at ${transitionStartTime.toFixed(2)}s`);
  isTransitioning = true;
  nextTrackId = fadeInId; // Mark the track we are fading *to*

  const fadeEnd = transitionStartTime + FADE_DURATION_SECONDS;

  // --- Fade Out ---
  const gOut = fadeOutState.gainNode.gain;
  // Cancel any future ramps, set value now, then ramp down
  gOut.cancelScheduledValues(audioContext.currentTime);
  gOut.setValueAtTime(gOut.value, audioContext.currentTime); // Start fade from current gain
  gOut.linearRampToValueAtTime(0, fadeEnd);
  console.log(`Fading out ${fadeOutId} from ${gOut.value.toFixed(2)} to 0 over ${FADE_DURATION_SECONDS}s`);

  // --- Fade In ---
  // Start the fadeIn track scheduled for the transition time, initially silent
  if (!playTrack(fadeInId, transitionStartTime, 0)) { // Start playing scheduled, offset 0
    console.error(`Failed to schedule playTrack for fadeInId: ${fadeInId}. Aborting crossfade.`);
    // Abort fade: Ramp volume back up on the original track
    gOut.cancelScheduledValues(audioContext.currentTime); // Cancel the fade out
    gOut.linearRampToValueAtTime(1, audioContext.currentTime + 0.2); // Quick ramp back up
    isTransitioning = false;
    nextTrackId = null;
    return;
  }

  // Get the gain node that playTrack just created
  const fadeInGainNode = tracks.get(fadeInId)?.gainNode;
  if (!fadeInGainNode) {
    console.error(`GainNode for fadeInId ${fadeInId} not found after playTrack. Aborting.`);
    // Abort fade: Ramp volume back up on the original track
    gOut.cancelScheduledValues(audioContext.currentTime);
    gOut.linearRampToValueAtTime(1, audioContext.currentTime + 0.2);
    stopTrackInternal(fadeInId); // Stop the track we tried to start
    isTransitioning = false;
    nextTrackId = null;
    return;
  }
  const gIn = fadeInGainNode.gain;
  gIn.setValueAtTime(0, transitionStartTime); // Ensure it starts silent at the scheduled time
  gIn.linearRampToValueAtTime(1, fadeEnd); // Ramp up to full volume
  console.log(`Fading in ${fadeInId} from 0 to 1 over ${FADE_DURATION_SECONDS}s`);


  // --- Cleanup Timeout ---
  clearTimeout(transitionTimeout!);
  transitionTimeout = setTimeout(
    () => {
      console.log(`Crossfade timeout reached for ${fadeOutId} -> ${fadeInId}.`);
      stopTrackInternal(fadeOutId); // Stop the track that faded out completely

      // Update state: the fadeIn track is now the current track
      currentTrackId = fadeInId;
      // Update index based on the newly current track within the section
      if (currentSectionTracks) {
        currentTrackIndexInSection = currentSectionTracks.indexOf(fadeInId);
        if (currentTrackIndexInSection === -1) {
          console.warn(`Track ${fadeInId} finished transition but not found in current section list? Section:`, currentSectionTracks);
          // This might indicate the section changed *during* the fade.
          // Might need to re-evaluate section state here. For now, just log.
          setActiveSection(null); // Clear potentially invalid section state
        } else {
          console.log(`Cross-fade complete. Now playing '${fadeInId}' (index ${currentTrackIndexInSection}).`);
        }
      } else {
        console.log(`Cross-fade complete. Now playing '${fadeInId}' (no active section).`);
        currentTrackIndexInSection = -1; // No section
      }

      nextTrackId = null; // No longer heading towards a specific track
      isTransitioning = false;
    },
    // Use duration from now until fade ends
    Math.max(0, (fadeEnd - audioContext.currentTime)) * 1000 + 50 // Add small buffer (50ms)
  );
}

// --- Public API ---

/** Sets the tracks considered the "current section" */
export function setActiveSection(sectionTrackIds: string[] | null): void {
  if (!audioContext) return; // Need context

  const newSectionKey = sectionTrackIds ? sectionTrackIds.join(',') : 'null';
  const oldSectionKey = currentSectionTracks ? currentSectionTracks.join(',') : 'null';

  if (newSectionKey === oldSectionKey) {
    // console.log("setActiveSection: Section is the same, no change.");
    return; // No change needed
  }

  console.log(`Setting active section: ${sectionTrackIds ? `[${sectionTrackIds.join(', ')}]` : 'None'}`);
  currentSectionTracks = sectionTrackIds ? [...sectionTrackIds] : null; // Store copy or null

  // If a new section is set, reset the index. The index will be correctly
  // set when a track from this section actually starts playing (via startFirstTrack or transitionToTrack).
  // If the section is cleared (null), also reset the index.
  currentTrackIndexInSection = -1;

  // Optional: If clearing the section should also stop music, do it here.
  // if (currentSectionTracks === null && currentTrackId) {
  //    console.log("Active section cleared, stopping playback.");
  //    stopAllPlayback();
  // }
}

/** Checks if the currentTrackId belongs to the provided section list AND that list is the active one */
export function isCurrentTrackInSection(sectionTrackIdsToCheck: string[]): boolean {
  if (!currentTrackId || !currentSectionTracks || !sectionTrackIdsToCheck) {
    return false;
  }

  // Check if the provided list *matches* the internally stored active section list
  const isActiveSectionSameAsChecked = currentSectionTracks.length === sectionTrackIdsToCheck.length &&
    currentSectionTracks.every((track, index) => track === sectionTrackIdsToCheck[index]);

  if (!isActiveSectionSameAsChecked) {
    // The section defined externally doesn't match what the audio player thinks is active
    return false;
  }

  // If the sections match, check if the current track is in that list
  return currentSectionTracks.includes(currentTrackId);
}


export function startFirstTrack(trackId: string): boolean {
  if (!audioContext) {
    console.error("startFirstTrack: AudioContext not ready.");
    return false;
  }
  if (currentTrackId || isTransitioning) {
    console.warn(`startFirstTrack: Cannot start '${trackId}', already playing '${currentTrackId}' or transitioning.`);
    return false; // Don't start if something is already playing or mid-transition
  }
  if (!tracks.get(trackId)?.audioBuffer) {
    console.error(`startFirstTrack: '${trackId}' not loaded.`);
    // Attempt to load it now? Or rely on preloading? Let's try loading.
    loadTrack(trackId).then(loaded => {
      if (loaded) {
        console.log(`Loaded '${trackId}' on demand, trying to start again.`);
        startFirstTrack(trackId); // Retry after loading
      } else {
        console.error(`Failed to load '${trackId}' on demand.`);
      }
    });
    return false; // Return false for now, retry will happen async
  }


  console.log(`Starting first track: ${trackId}`);
  if (playTrack(trackId, audioContext.currentTime, 0)) {
    currentTrackId = trackId;
    // Update index based on the newly current track within the section
    if (currentSectionTracks) {
      currentTrackIndexInSection = currentSectionTracks.indexOf(trackId);
      if (currentTrackIndexInSection === -1) {
        console.warn(`Started track ${trackId} but not found in current section list? Section:`, currentSectionTracks);
        // This implies setActiveSection wasn't called correctly before startFirstTrack
        setActiveSection(null); // Clear potentially invalid section state
      } else {
        console.log(`Started track ${trackId} at index ${currentTrackIndexInSection}`);
      }
    } else {
      console.log(`Started track ${trackId} (no active section).`);
      currentTrackIndexInSection = -1; // No section
    }
    return true;
  }
  return false;
}

export function transitionToTrack(targetId: string): boolean {
  if (!audioContext) {
    console.error("transitionToTrack: AudioContext not ready.");
    return false;
  }
  if (isTransitioning) {
    console.warn(`transitionToTrack: Cannot transition to '${targetId}', transition already in progress (to '${nextTrackId}').`);
    return false; // Don't allow new transition if one is active
  }

  // Case 1: Nothing is currently playing - just start the target track.
  if (!currentTrackId) {
    console.log(`transitionToTrack: No current track, using startFirstTrack for ${targetId}`);
    // Ensure the target track belongs to the currently set section (if any) before starting
    if (currentSectionTracks && !currentSectionTracks.includes(targetId)) {
      console.warn(`transitionToTrack: Target track ${targetId} does not belong to the active section [${currentSectionTracks.join(', ')}]. Section state might be inconsistent.`);
      // Decide: Clear section? Force set section based on target? For now, proceed but log warning.
    } else if (!currentSectionTracks) {
      console.log(`transitionToTrack: Starting ${targetId} with no active section set.`);
    }
    return startFirstTrack(targetId);
  }

  // Case 2: Target track is already playing - do nothing.
  if (currentTrackId === targetId) {
    console.log(`transitionToTrack: Target track '${targetId}' is already playing.`);
    // Ensure index is correct if section context was somehow lost/reset
    if (currentSectionTracks && currentTrackIndexInSection === -1) {
      currentTrackIndexInSection = currentSectionTracks.indexOf(targetId);
    }
    return true;
  }

  // Case 3: Target track is different, need to transition.
  if (!tracks.get(targetId)?.audioBuffer) {
    console.error(`transitionToTrack: Target track '${targetId}' not loaded.`);
    // Attempt to load?
    loadTrack(targetId).then(loaded => {
      if(loaded) {
        console.log(`Loaded '${targetId}' on demand, trying transition again.`);
        transitionToTrack(targetId); // Retry async
      } else {
        console.error(`Failed to load '${targetId}' on demand for transition.`);
      }
    });
    return false; // Return false now, retry happens async
  }

  // Find a suitable time to start the crossfade
  // Using the simplified version for now
  const startTime = findNextTransitionPoint(currentTrackId);
  if (startTime === null) {
    console.warn(`transitionToTrack: Could not find a transition point for '${currentTrackId}'. Cannot transition.`);
    // Fallback? Maybe just cut immediately? Or log and fail?
    // Let's try an immediate cut as a fallback for now
    console.log(`Falling back to immediate cut for transition ${currentTrackId} -> ${targetId}`);
    stopTrackInternal(currentTrackId);
    const started = startFirstTrack(targetId); // Use startFirstTrack to handle index update
    return started;
    // return false; // Original behavior: fail if no point found
  }

  console.log(`transitionToTrack: Initiating transition from '${currentTrackId}' to '${targetId}' at ${startTime.toFixed(2)}s`);
  performCrossfade(currentTrackId, targetId, startTime);
  return true; // Transition initiated
}

export function stopAllPlayback() {
  if (!audioContext) return;

  console.log("Stopping all playback...");
  clearTimeout(transitionTimeout!); // Cancel any pending transition cleanup

  // Stop all currently playing/scheduled nodes
  tracks.forEach((_, id) => {
    stopTrackInternal(id);
  });

  // Reset state variables
  currentTrackId = null;
  nextTrackId = null;
  isTransitioning = false;
  currentSectionTracks = null; // Clear section
  currentTrackIndexInSection = -1; // Clear index

  console.log("All playback stopped and state reset.");
}

// --- Getters ---
export function getCurrentTrackId(): string | null { return currentTrackId; }
export function getNextTrackId(): string | null { return nextTrackId; }
export function isCurrentlyTransitioning(): boolean { return isTransitioning; }
export function getCurrentSectionTracks(): string[] | null { return currentSectionTracks ? [...currentSectionTracks] : null; } // Return copy
export function getCurrentTrackIndexInSection(): number { return currentTrackIndexInSection; }