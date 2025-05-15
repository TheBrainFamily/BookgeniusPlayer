import { getAudioContext, initAudioContext } from "@/audio-crossfader";
import { CURRENT_BOOK } from "./consts";

let audioContext: AudioContext | null = null;
type TrackState = { id: string; audioBuffer: AudioBuffer; duration: number; sourceNode: AudioBufferSourceNode | null; gainNode: GainNode | null };
const tracks: TrackState[] = [];

// --- Interfaces and Types ---
// interface TrackState {
//   transitionPoints?: number[];
//   audioBuffer?: AudioBuffer;
//   sourceNode?: AudioBufferSourceNode | null;
//   gainNode?: GainNode | null;
//   duration?: number; // Added for pre-emptive transition
//   preemptiveTransitionTimeout?: ReturnType<typeof setTimeout> | null; // Added for managing pre-emptive transition
// }

export async function loadTrack(trackId: string): Promise<boolean> {
  audioContext = getAudioContext();
  if (!audioContext) {
    initAudioContext();
    audioContext = getAudioContext();
  }
  if (audioContext!.state !== "running") {
    // audioContext is guaranteed to be non-null here
    console.warn("loadTrack: AudioContext is not running. Loading may succeed but playback won't start yet.");
    // await audioContext!.resume().catch((e) => console.error("Error resuming AudioContext before load:", e));
    // Resuming here might be too late if the user gesture is already "spent". initAudioContext should handle it.
  }

  const existing = tracks.find((track) => track.id === trackId && track.audioBuffer);
  if (existing) {
    // console.log(`Track '${trackId}' already loaded.`);
    return true;
  }

  const audioPath = `/${CURRENT_BOOK}/${trackId}`;
  console.log(`Loading '${trackId}' from ${audioPath}...`);
  try {
    const response = await fetch(audioPath);
    if (!response.ok) throw new Error(`HTTP ${response.status} – ${response.statusText}`);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioContext!.decodeAudioData(arrayBuffer);
    tracks.push({ id: trackId, audioBuffer, duration: audioBuffer.duration, sourceNode: null, gainNode: null });
    console.log(`Decoded '${trackId}'. Duration: ${audioBuffer.duration.toFixed(2)}s.`);
    return true;
  } catch (e) {
    console.error(`Error loading '${trackId}':`, e);
    // tracks = tracks.filter((track) => track.id !== trackId);
    return false;
  }
}

export function playTrack(trackId: string, startTime: number = 0, offset: number = 0): boolean {
  if (!audioContext || audioContext.state !== "running") {
    console.error(`Cannot play track '${trackId}', AudioContext not ready/running. State: ${audioContext?.state}`);
    initAudioContext(); // Attempt to re-init/resume
  }

  const state = tracks.find((track) => track.id === trackId && track.audioBuffer);
  if (!state?.audioBuffer) {
    console.error(`AudioBuffer missing for '${trackId}'. Cannot play.`);
    return false;
  }

  stopTrackInternal(trackId);
  stopAllTracks();

  const source = audioContext.createBufferSource();
  const gainNode = audioContext.createGain();
  source.buffer = state.audioBuffer;
  source.loop = false; // onended will handle sequence
  // gainNode.gain.setValueAtTime(startTime <= audioContext.currentTime ? 1 : 0, startTime);
  source.connect(gainNode).connect(audioContext.destination);

  // Clear any existing preemptive transition timeout for this track if it's being re-played
  // const existingStateForTimeout = tracks.find((track) => track.id === trackId && track.preemptiveTransitionTimeout);
  // if (existingStateForTimeout?.preemptiveTransitionTimeout) {
  //   clearTimeout(existingStateForTimeout.preemptiveTransitionTimeout);
  //   existingStateForTimeout.preemptiveTransitionTimeout = null;
  // }

  const calculatedOffset = offset % state.audioBuffer.duration;
  console.log(`offset: ${offset}, audioBufferDuration: ${state.audioBuffer.duration}, calculated offset: ${calculatedOffset}`);

  try {
    source.start(startTime, calculatedOffset);

    state.sourceNode = source;
    state.gainNode = gainNode;
    console.log(`Scheduled '${trackId}' @ ${startTime.toFixed(2)}s (offset ${calculatedOffset.toFixed(2)}s). Duration: ${state.audioBuffer.duration.toFixed(2)}s`);

    return true;
  } catch (err) {
    console.error(`Error starting source node for '${trackId}':`, err);
    // stopTrackInternal(trackId);
    return false;
  }
}

export function stopAllTracks() {
  tracks.forEach((state) => {
    console.log(`GOZDECKI Stopping track '${state.id}'`);
    stopTrackInternal(state.id);
  });
}

function stopTrackInternal(trackId: string) {
  const state = tracks.find((track) => track.id === trackId && track.audioBuffer);
  if (!state) return;

  // if (state.preemptiveTransitionTimeout) {
  //   clearTimeout(state.preemptiveTransitionTimeout);
  //   state.preemptiveTransitionTimeout = null;
  //   // console.log(`Cleared pre-emptive transition timeout for '${trackId}' during stop.`);
  // }

  if (state.sourceNode) {
    state.sourceNode.onended = null; // Crucial: remove handler before stopping
    try {
      state.sourceNode.stop();
    } catch {
      // Linter: Unused 'e' -> _ignoredError -> empty catch
      console.warn(`GOZDECKI Ignoring error stopping source node for ${trackId}:`, e);
    }
    try {
      state.sourceNode.disconnect();
    } catch {
      // Linter: Unused 'e' -> empty catch
      console.warn(`GOZDECKI Ignoring error disconnecting source node for ${trackId}:`, e);
    }
    state.sourceNode = null;
  }
  if (state.gainNode) {
    try {
      state.gainNode.disconnect();
    } catch {
      // Linter: Unused 'e' -> empty catch
      console.warn(`GOZDECKI Ignoring error disconnecting gain node for ${trackId}:`, e);
    }
    state.gainNode = null;
  }
  // console.log(`Stopped internal nodes for ${trackId}`);
}
