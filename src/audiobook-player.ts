import { getAudioContext, initAudioContext } from "@/audio-crossfader";
import { CURRENT_BOOK } from "./consts";

export type AudiobookTrackEvent = {
  timestamp: number; // Time in seconds within the track
  callback: () => void;
  triggered: boolean;
};

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
    tracks.push({ id: trackId, audioBuffer, duration: audioBuffer.duration, sourceNode: null, gainNode: null, playbackIntervalId: null, events: null, startTimeInContext: 0 });
    console.log(`Decoded '${trackId}'. Duration: ${audioBuffer.duration.toFixed(2)}s.`);
    return true;
  } catch (e) {
    console.error(`Error loading '${trackId}':`, e);
    // tracks = tracks.filter((track) => track.id !== trackId);
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
  source.connect(gainNode).connect(audioContext.destination);

  const calculatedOffset = offset % state.audioBuffer.duration;
  console.log(`offset: ${offset}, audioBufferDuration: ${state.audioBuffer.duration}, calculated offset: ${calculatedOffset}`);

  // Store events and reset triggered status
  if (events) {
    state.events = events.map((event) => ({ ...event, triggered: false }));
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
              // console.log(`Triggering event for ${trackId} at ${event.timestamp}s (currentTrackTime: ${currentTrackTime.toFixed(2)})`);
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
      try {
        state.events[state.events.length - 1].callback();
      } catch (e) {
        console.error(`Error executing event callback for ${trackId} at ${state.audioBuffer.duration}s:`, e);
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
        } catch {}
        state.sourceNode = null;
      }
      if (state.gainNode) {
        try {
          state.gainNode.disconnect();
        } catch {}
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
