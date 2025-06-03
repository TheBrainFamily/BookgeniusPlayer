import { getAudioContext, initAudioContext, getAudiobookGainNode } from "@/audio-crossfader";
import { CURRENT_BOOK } from "./consts";

export type AudiobookTrackEvent = {
  timestamp: number; // Time in seconds within the track
  callback: () => void;
  triggered: boolean;
};

// Add type for custom event
interface AudiobookStopEvent extends CustomEvent {
  detail: { backgroundVolume: number };
}

let audioContext: AudioContext | null = null;
type TrackState = {
  id: string;
  audioBuffer: AudioBuffer;
  duration: number;
  sourceNode: AudioBufferSourceNode | null;
  gainNode: GainNode | null;
  playbackIntervalId?: ReturnType<typeof setInterval> | null; // For timed events
  events?: AudiobookTrackEvent[] | null; // Timed events
  startTimeInContext?: number; // AudioContext's time when this track started
};
const tracks: TrackState[] = [];

// --- Initialization and event registration ---
export function initAudiobookPlayer(): void {
  // Set up event listener for volume-related stops
  window.addEventListener("audiobookShouldStop", ((event: AudiobookStopEvent) => {
    console.log("Audiobook event:", event.detail);

    // Check if this is an actual stop request or just a background music change
    // If the backgroundVolume is 1.0 (100% background), truly stop the audiobook
    // Otherwise, let background music transitions happen without stopping audiobook
    if (event.detail.backgroundVolume === 1.0) {
      console.log("Stopping audiobook tracks (100% background)");
      stopAllTracks();
    } else {
      console.log("Background music change - audiobook continues playing");
    }
  }) as EventListener);
}

// Call init when this module is loaded
initAudiobookPlayer();

// --- Interfaces and Types ---
// interface TrackState {
//   transitionPoints?: number[];
//   audioBuffer?: AudioBuffer;
//   sourceNode?: AudioBufferSourceNode | null;
//   gainNode?: GainNode | null;
//   duration?: number; // Added for pre-emptive transition
//   preemptiveTransitionTimeout?: ReturnType<typeof setTimeout> | null; // Added for managing pre-emptive transition
// }

/* ——————————————————————————————————————————————————————————— */
/* main                                                        */
/* ——————————————————————————————————————————————————————————— */

export async function loadTrack(trackId: string): Promise<boolean> {
  /* 1 ▸ sanity-check what’s in the bundle --------------------------- */

  /* 2 ▸ audio context ---------------------------------------------- */
  audioContext = getAudioContext() ?? (initAudioContext(), getAudioContext());

  if (tracks.find((t) => t.id === trackId && t.audioBuffer)) return true;

  /* 3 ▸ fetch ------------------------------------------------------- */
  const rel = `${CURRENT_BOOK}/${trackId}`; // 1984/audiobook_data/book0.mp3
  const url = `/${rel.replace(/^\/+/, "")}`; // /1984/…
  console.log(`🎧 loadTrack → ${url}`);

  let buf: ArrayBuffer;
  try {
    const res = await fetch(url);
    const isLocal = url.startsWith("/");
    if (!(res.ok || (isLocal && res.status === 0))) throw new Error(`Fetch failed: HTTP ${res.status}`);

    buf = await res.arrayBuffer();
    if (!buf.byteLength) throw new Error("Empty file");
  } catch (e) {
    console.error("❌ Fetch error:", e);
    return false;
  }

  /* 4 ▸ decode ------------------------------------------------------ */
  try {
    const audioBuffer = await audioContext!.decodeAudioData(buf);
    console.log(`✅ decoded – ${audioBuffer.duration.toFixed(2)} s`);
    tracks.push({ id: trackId, audioBuffer, duration: audioBuffer.duration, sourceNode: null, gainNode: null, playbackIntervalId: null, events: null, startTimeInContext: 0 });
    return true;
  } catch (e) {
    console.error("❌ decodeAudioData error:", e);
    return false;
  }
}

export function playTrack(trackId: string, startTime: number = 0, offset: number = 0, events?: AudiobookTrackEvent[]): boolean {
  if (!audioContext || audioContext.state !== "running") {
    console.error(`Cannot play track '${trackId}', AudioContext not ready/running. State: ${audioContext?.state}`);
    initAudioContext(); // Attempt to re-init/resume
    // It's possible initAudioContext() doesn't make it ready immediately.
    // Consider returning false or re-checking state after a short delay if critical.
    if (!audioContext || audioContext.state !== "running") {
      console.error("AudioContext still not running after re-init attempt.");
      return false;
    }
  }

  const state = tracks.find((track) => track.id === trackId && track.audioBuffer);
  if (!state?.audioBuffer) {
    console.error(`AudioBuffer missing for '${trackId}'. Cannot play.`);
    return false;
  }

  stopTrackInternal(trackId); // Stop previous instance of this track, clears old interval
  stopAllTracks(); // Stops other tracks

  const source = audioContext.createBufferSource();
  const gainNode = audioContext.createGain();
  source.buffer = state.audioBuffer;
  source.loop = false;

  // Connect to the audiobook gain node instead of directly to destination
  const audiobookGainNode = getAudiobookGainNode();
  source.connect(gainNode);
  gainNode.connect(audiobookGainNode || audioContext.destination);

  const calculatedOffset = offset % state.audioBuffer.duration;
  console.log(`offset: ${offset}, audioBufferDuration: ${state.audioBuffer.duration}, calculated offset: ${calculatedOffset}`);

  // Store events and reset triggered status
  if (events) {
    state.events = events.map((event) => ({
      ...event,
      // skip events that are already in the past relative to the offset we begin at
      triggered: event?.timestamp <= calculatedOffset,
    }));
  } else {
    state.events = null;
  }

  try {
    const actualStartTimeInContext = audioContext.currentTime + (startTime > 0 ? startTime - audioContext.currentTime : 0);
    source.start(actualStartTimeInContext, calculatedOffset);

    state.sourceNode = source;
    state.gainNode = gainNode;
    state.startTimeInContext = actualStartTimeInContext; // Store the context time when playback is scheduled to start

    console.log(`Scheduled '${trackId}' @ ${actualStartTimeInContext.toFixed(2)}s (offset ${calculatedOffset.toFixed(2)}s). Duration: ${state.audioBuffer.duration.toFixed(2)}s`);

    if (state.events && state.events.length > 0) {
      if (state.playbackIntervalId) {
        clearInterval(state.playbackIntervalId); // Clear any lingering interval
      }
      state.playbackIntervalId = setInterval(() => {
        if (!audioContext || !state.sourceNode || !state.startTimeInContext) {
          // If context is lost, source is gone, or startTimeInContext isn't set, stop interval
          if (state.playbackIntervalId) clearInterval(state.playbackIntervalId);
          state.playbackIntervalId = null;
          return;
        }

        // Elapsed time since this track's source.start() was called, in the AudioContext's timeline
        const timeSinceScheduledStart = audioContext.currentTime - state.startTimeInContext;
        // Effective playback time within the audio buffer
        const currentTrackTime = calculatedOffset + timeSinceScheduledStart;

        // console.log(`Interval check for ${trackId}: contextTime=${audioContext.currentTime.toFixed(2)}, trackTime=${currentTrackTime.toFixed(2)}`);

        state.events?.forEach((event) => {
          if (!event.triggered && currentTrackTime >= event.timestamp) {
            try {
              event.callback();
            } catch (e) {
              console.error(`Error executing event callback for ${trackId} at ${event.timestamp}s:`, e);
            }
            event.triggered = true;
          }
        });

        // Optional: Stop interval if all events are triggered
        if (state.events?.every((event) => event.triggered)) {
          if (state.playbackIntervalId) clearInterval(state.playbackIntervalId);
          state.playbackIntervalId = null;
          // console.log(`All events triggered for ${trackId}, clearing interval.`);
        }
      }, 100); // Check every 100ms
    }

    // Handle track ending naturally
    source.onended = () => {
      if (state.events && state.events.length > 0) {
        try {
          state.events[state.events.length - 1].callback();
        } catch (e) {
          console.error(`Error executing event callback for ${trackId} at ${state.audioBuffer.duration}s:`, e);
        }
      }
      console.log(`Track '${trackId}' ended naturally.`);
      if (state.playbackIntervalId) {
        clearInterval(state.playbackIntervalId);
        state.playbackIntervalId = null;
        // console.log(`Cleared interval for ${trackId} on natural end.`);
      }
      // Clean up nodes, but don't remove from `tracks` array here,
      // as it might be replayed or its buffer might be needed.
      // stopTrackInternal handles node cleanup if called.
      if (state.sourceNode) {
        try {
          state.sourceNode.disconnect();
        } catch {
          // Ignore disconnection errors
        }
        state.sourceNode = null;
      }
      if (state.gainNode) {
        try {
          state.gainNode.disconnect();
        } catch {
          // Ignore disconnection errors
        }
        state.gainNode = null;
      }
      // Check if all events have been triggered, especially if the track ends before some event times.
      // This might be a place for cleanup or logging if some events were missed.
    };

    return true;
  } catch (err) {
    console.error(`Error starting source node for '${trackId}':`, err);
    // stopTrackInternal(trackId); // Already called above, this might be redundant or clear the new interval too soon
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

  if (state.playbackIntervalId) {
    clearInterval(state.playbackIntervalId);
    state.playbackIntervalId = null;
    // console.log(`Cleared playback interval for '${trackId}' during stop.`);
  }

  // if (state.preemptiveTransitionTimeout) {
  //   clearTimeout(state.preemptiveTransitionTimeout);
  //   state.preemptiveTransitionTimeout = null;
  //   // console.log(`Cleared pre-emptive transition timeout for '${trackId}' during stop.`);
  // }

  if (state.sourceNode) {
    state.sourceNode.onended = null; // Crucial: remove handler before stopping
    try {
      state.sourceNode.stop();
    } catch (e) {
      // Linter: Unused 'e' -> _ignoredError -> empty catch
      console.warn(`GOZDECKI Ignoring error stopping source node for ${trackId}:`, e);
    }
    try {
      state.sourceNode.disconnect();
    } catch (e) {
      // Linter: Unused 'e' -> empty catch
      console.warn(`GOZDECKI Ignoring error disconnecting source node for ${trackId}:`, e);
    }
    state.sourceNode = null;
  }
  if (state.gainNode) {
    try {
      state.gainNode.disconnect();
    } catch (e) {
      // Linter: Unused 'e' -> empty catch
      console.warn(`GOZDECKI Ignoring error disconnecting gain node for ${trackId}:`, e);
    }
    state.gainNode = null;
  }
  // console.log(`Stopped internal nodes for ${trackId}`);
}

// Make function available on window for testing/debugging
// Use proper type declaration to avoid TypeScript errors
declare global {
  interface Window {
    stopAllTracks: typeof stopAllTracks;
  }
}
window.stopAllTracks = stopAllTracks;
