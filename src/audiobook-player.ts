import { initAudioContext, loadTrack } from "@/audio-crossfader";

let audioContext: AudioContext | null = null;
const tracks: Map<string, TrackState> = new Map();

// --- Interfaces and Types ---
interface TrackState {
  transitionPoints?: number[];
  audioBuffer?: AudioBuffer;
  sourceNode?: AudioBufferSourceNode | null;
  gainNode?: GainNode | null;
  duration?: number; // Added for pre-emptive transition
  preemptiveTransitionTimeout?: ReturnType<typeof setTimeout> | null; // Added for managing pre-emptive transition
}

export function playTrack(trackId: string, startTime: number = 0, offset: number = 0): boolean {
  if (!audioContext || audioContext.state !== "running") {
    console.error(`Cannot play track '${trackId}', AudioContext not ready/running. State: ${audioContext?.state}`);
    initAudioContext(); // Attempt to re-init/resume
  }

  const state = tracks.get(trackId);
  if (!state?.audioBuffer) {
    console.error(`AudioBuffer missing for '${trackId}'. Cannot play.`);
    return false;
  }

  const source = audioContext.createBufferSource();
  const gainNode = audioContext.createGain();
  source.buffer = state.audioBuffer;
  source.loop = false; // onended will handle sequence
  // gainNode.gain.setValueAtTime(startTime <= audioContext.currentTime ? 1 : 0, startTime);
  source.connect(gainNode).connect(audioContext.destination);

  // Clear any existing preemptive transition timeout for this track if it's being re-played
  const existingStateForTimeout = tracks.get(trackId);
  if (existingStateForTimeout?.preemptiveTransitionTimeout) {
    clearTimeout(existingStateForTimeout.preemptiveTransitionTimeout);
    existingStateForTimeout.preemptiveTransitionTimeout = null;
  }

  // PINGWING TODO
  // source.onended = async () => {
  //   const stateAtEnd = tracks.get(trackId);
  //   const thisSourceInstanceEnded = stateAtEnd?.sourceNode === source;
  //
  //   // Conditions for this onended handler to take action:
  //   // 1. This track (trackId) must be the currentTrackId.
  //   // 3. This specific source instance (source) must be the one that ended, not one already stopped/replaced.
  //   if (trackId === currentTrackId && thisSourceInstanceEnded) {
  //     console.log(`onended for current track '${trackId}'. No active transition. Attempting to play next in section.`);
  //     if (currentSectionTracks && currentSectionTracks.length > 0) {
  //       await playNextTrackInSection();
  //     } else {
  //       console.log(`Track '${trackId}' ended, but no section or section empty. Clearing currentTrackId.`);
  //       currentTrackId = null;
  //       currentTrackIndexInSection = -1;
  //     }
  //   } else {
  //     console.log(
  //       `onended for '${trackId}': Conditions not met for auto-play next, thisSourceInstanceEnded: ${thisSourceInstanceEnded}, sourceNodeAtEnd: ${stateAtEnd?.sourceNode === source}`,
  //     );
  //   }
  // };

  try {
    source.start(startTime, offset % state.audioBuffer.duration);
    state.sourceNode = source;
    state.gainNode = gainNode;
    console.log(`Scheduled '${trackId}' @ ${startTime.toFixed(2)}s (offset ${offset.toFixed(2)}s). Duration: ${state.audioBuffer.duration.toFixed(2)}s`);

    return true;
  } catch (err) {
    console.error(`Error starting source node for '${trackId}':`, err);
    // stopTrackInternal(trackId);
    return false;
  }
}
