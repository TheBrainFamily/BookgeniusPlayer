import { parseBlob } from "music-metadata";
import CodecParser from "codec-parser";
import { buildAudioUrl } from "./utils/assetUrls";

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
  fullyLoadedListener?: ((event: CustomEvent) => void) | null; // Reference to the 'trackFullyLoaded' event listener
  isFullyLoaded?: boolean; // Added to indicate if the track is fully decoded
  rawBuffer?: ArrayBuffer; // Raw buffer for tracks downloaded without decoding
}

// --- Configuration ---
const FADE_DURATION_SECONDS = 8.0;
const MINI_FADE_DURATION_S = 0.15; // 150ms for smooth seamless transitions
const PRE_END_TRANSITION_TRIGGER_SECONDS = 4.0; // Time before track end to trigger transition
/**
 * Exponent for non-linear volume scaling.
 * This makes the lower end of the slider have a finer control.
 * The value 1.737 is chosen so that a slider value of 0.5 corresponds to a gain of ~0.3.
 */
const VOLUME_SCALE = 1.737;

const PLAYLIST_LOAD_STAGGER_MS = 100;
const PLAYLIST_UPDATE_DEBOUNCE_MS = 300;

const STREAMING_FILE_SIZE_THRESHOLD = 256 * 1024; // Reduced to 256KB to enable streaming for smaller files

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

// Crossfade interruption control
let currentCrossfadeId = 0; // Monotonically increasing token for active crossfade
let activeCrossfadeTimeout: ReturnType<typeof setTimeout> | null = null; // Cleanup timer for the active crossfade

let currentSectionTracks: string[] | null = null;
let currentTrackIndexInSection: number = -1;
// undefined: no pending change; null: pending clear; string[]: pending set
let pendingSectionTracks: string[] | null | undefined = undefined;

// Debouncing for playlist updates to avoid UI spam
let playlistUpdateTimeout: ReturnType<typeof setTimeout> | null = null;

// This is now loaded dynamically, so we'll get it when needed
export function getTrackDetailsById(id: string): TrackState | null {
  return tracks.get(id) || null;
}

export function getCurrentTrackData(): TrackState | null {
  if (!currentTrackId) return null;
  return tracks.get(currentTrackId) || null;
}

// --- Core Functions ---

/**
 * Helper function to properly clean up track state and revoke cover art URLs
 * This should only be called when a track is being completely removed from the cache
 */
function cleanupTrackState(trackId: string): void {
  const state = tracks.get(trackId);
  if (!state) return;

  // Revoke cover art URL if it's a blob URL
  if (state.coverArtUrl && state.coverArtUrl.startsWith("blob:")) {
    URL.revokeObjectURL(state.coverArtUrl);
  }

  // Clean up any remaining listeners
  if (state.fullyLoadedListener) {
    window.removeEventListener("trackFullyLoaded", state.fullyLoadedListener);
  }

  // Clear any timeouts
  if (state.preemptiveTransitionTimeout) {
    clearTimeout(state.preemptiveTransitionTimeout);
  }

  // Remove from tracks map
  tracks.delete(trackId);
}

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
  return buildAudioUrl(trackId);
}

function isFetchOk(res: Response, url: string): boolean {
  const local = url.startsWith("/");
  return res.ok || (local && res.status === 0);
}

function getAudioOffset(arrayBuffer: ArrayBuffer): number {
  const dataView = new DataView(arrayBuffer);
  // Check for ID3v2 tag identifier "ID3"
  if (dataView.byteLength > 10 && dataView.getUint8(0) === 0x49 && dataView.getUint8(1) === 0x44 && dataView.getUint8(2) === 0x33) {
    const b1 = dataView.getUint8(6);
    const b2 = dataView.getUint8(7);
    const b3 = dataView.getUint8(8);
    const b4 = dataView.getUint8(9);
    // Check for synchsafe integers (MSB of each byte is 0)
    if ((b1 & 0x80) === 0 && (b2 & 0x80) === 0 && (b3 & 0x80) === 0 && (b4 & 0x80) === 0) {
      const tagSize = (b1 << 21) | (b2 << 14) | (b3 << 7) | b4;
      return tagSize + 10; // Add 10 bytes for the header
    }
  }
  return 0; // No valid ID3v2 tag found
}

function combineChunks(chunks: Uint8Array[]): Uint8Array {
  const totalBytes = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  return combined;
}

/**
 * Validates image data by checking file signatures and format compatibility.
 */
function validateImageData(imageData: Uint8Array, format: string): boolean {
  if (!imageData || imageData.length < 8) {
    return false;
  }

  // Check common image file signatures
  const signatures = {
    "image/jpeg": [0xff, 0xd8, 0xff],
    "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    "image/gif": [0x47, 0x49, 0x46],
    "image/webp": [0x52, 0x49, 0x46, 0x46], // RIFF header for WebP
    "image/bmp": [0x42, 0x4d],
  };

  const normalizedFormat = format.toLowerCase();
  const signature = signatures[normalizedFormat as keyof typeof signatures];

  if (!signature) {
    // If we don't know the format signature, allow it through
    // but log for debugging
    console.debug(`Unknown image format: ${format}, allowing through`);
    return true;
  }

  // Check if the data starts with the expected signature
  for (let i = 0; i < signature.length; i++) {
    if (i >= imageData.length || imageData[i] !== signature[i]) {
      return false;
    }
  }

  return true;
}

/**
 * Validates that an image URL can be loaded by attempting to create an Image element.
 */
function validateImageUrl(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let timeoutId: number | null = null;

    const cleanup = () => {
      if (timeoutId !== null) clearTimeout(timeoutId);
      img.onload = null;
      img.onerror = null;
    };

    img.onload = () => {
      cleanup();
      resolve();
    };
    img.onerror = () => {
      cleanup();
      reject(new Error("Image failed to load"));
    };

    // Set a timeout to prevent hanging
    timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Image load timeout"));
    }, 5000);

    img.src = url;
  });
}

/**
 * Parses metadata from an audio buffer, updates title, and manages the cover art object URL to prevent memory leaks.
 * @param audioData The audio data as a Uint8Array or ArrayBuffer.
 * @param currentTitle The current title, to be used as a fallback.
 * @param currentCoverArtUrl The existing cover art URL, which will be revoked if a new one is created.
 * @returns A promise that resolves to an object with the updated title, coverArtUrl, and duration.
 */
async function parseMetadataAndUpdate(
  audioData: Uint8Array | ArrayBuffer,
  currentTitle: string,
  currentCoverArtUrl?: string,
): Promise<{ title: string; coverArtUrl: string; duration?: number }> {
  let title = currentTitle;
  let coverArtUrl = currentCoverArtUrl || "";
  let duration: number | undefined;

  try {
    const blob = new Blob([audioData], { type: "audio/mpeg" });
    const { common, format } = await parseBlob(blob);
    title = common.title || title;
    duration = format.duration;

    if (common.picture?.[0]) {
      try {
        const pic = common.picture[0];

        // Validate picture data before creating blob
        if (pic.data && pic.data.length > 0 && pic.format) {
          const imageData = new Uint8Array(pic.data);

          // Validate that we have actual image data (check for common image file headers)
          const isValidImage = validateImageData(imageData, pic.format);

          if (isValidImage) {
            const newBlob = new Blob([imageData], { type: pic.format });
            const newUrl = URL.createObjectURL(newBlob);

            // Test if the URL is actually usable by creating an Image element
            await validateImageUrl(newUrl);

            // Only revoke the old URL if it's different from the new one and not empty
            if (coverArtUrl && coverArtUrl !== newUrl && coverArtUrl.startsWith("blob:")) {
              URL.revokeObjectURL(coverArtUrl);
            }

            coverArtUrl = newUrl;
          } else {
            console.warn(`Invalid image data detected for format: ${pic.format}`);
          }
        }
      } catch (imageError) {
        console.warn(`Image processing failed:`, imageError);
        // Keep the current coverArtUrl if image processing fails
      }
    }
  } catch (metadataError) {
    console.warn(`Metadata parsing failed for '${currentTitle}':`, metadataError);
    // If metadata parsing fails, we'll have defaults: title=currentTitle, coverArtUrl=existing, duration=undefined
  }

  return { title, coverArtUrl, duration };
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
    isFullyLoaded: true,
    title: metadata.title,
    coverArtUrl: metadata.coverArtUrl,
    transitionPoints: metadata.transitionPoints,
    sourceNode: null,
    gainNode: null,
  };
}

interface CodecFrame {
  duration?: number;
  totalBytesOut: number;
}

async function streamingDecodeAudioData(
  audioContext: AudioContext,
  arrayBuffer: ArrayBuffer,
  trackId: string,
  title: string,
  coverArtUrl: string,
  transitionPoints: number[] | undefined,
  isFullBuffer: boolean,
  knownTotalBytes?: number,
): Promise<AudioBuffer | null> {
  try {
    const fileSize = arrayBuffer.byteLength;
    const audioOffset = getAudioOffset(arrayBuffer);

    if (audioOffset >= fileSize) {
      console.log(`ID3 TAG (cover image) is bigger that the available file chunk for '${trackId}'. Cannot decode yet.`);
      return null;
    }

    const chunkSize = Math.min(256 * 1024, fileSize - audioOffset);
    const chunk = arrayBuffer.slice(audioOffset, audioOffset + chunkSize);

    let frames: CodecFrame[];
    try {
      const parser = new CodecParser("audio/mpeg");
      const iterator = parser.parseChunk(new Uint8Array(chunk));
      frames = [];
      let result = iterator.next();
      while (!result.done) {
        frames.push(result.value);
        result = iterator.next();
      }
    } catch (e) {
      console.warn(`CodecParser or frame iteration failed for '${trackId}', falling back to full decode:`, e);
      if (isFullBuffer) {
        return await audioContext.decodeAudioData(arrayBuffer);
      }
      // Partial buffer – cannot decode, propagate null so caller keeps downloading
      return null;
    }

    if (frames.length < 2) {
      console.warn(`Not enough MP3 frames found in the first chunk of '${trackId}' to stream. Falling back to full decode.`);
      if (isFullBuffer) {
        const { title: refreshedTitle, coverArtUrl: refreshedCoverArtUrl } = await parseMetadataAndUpdate(arrayBuffer, title, coverArtUrl);
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        const trackState = createTrackState(audioBuffer, { title: refreshedTitle, coverArtUrl: refreshedCoverArtUrl, transitionPoints });
        tracks.set(trackId, trackState);
        return audioBuffer;
      }
      return null;
    }

    const TARGET_DURATION_S = 5;
    let accumulatedDuration = 0;
    let framesToTake = 0;
    for (const frame of frames) {
      if (typeof frame.duration === "number" && !isNaN(frame.duration)) {
        accumulatedDuration += frame.duration / 1000;
        framesToTake++;
        if (accumulatedDuration >= TARGET_DURATION_S) {
          break;
        }
      }
    }

    if (framesToTake >= frames.length) {
      console.warn(`Full initial chunk for '${trackId}' has only ${accumulatedDuration.toFixed(2)}s of audio. Falling back to full decode for better UX.`);
      if (isFullBuffer) {
        return await audioContext.decodeAudioData(arrayBuffer);
      }
      return null;
    }

    const bytesForFrames = frames[framesToTake].totalBytesOut;
    const framesBuffer = chunk.slice(0, bytesForFrames);

    try {
      const decodedFirstChunk = await audioContext.decodeAudioData(framesBuffer);
      const chunkDuration = decodedFirstChunk.duration;
      if (!isFinite(chunkDuration) || chunkDuration <= 0) {
        console.warn(`Invalid decoded chunk duration for '${trackId}' (${chunkDuration}).`);
        if (isFullBuffer) {
          return await audioContext.decodeAudioData(arrayBuffer);
        }
        return null;
      }
      const estimatedBitrate = (bytesForFrames * 8) / chunkDuration;
      if (!isFinite(estimatedBitrate) || estimatedBitrate <= 0) {
        console.warn(`Invalid estimated bitrate for '${trackId}' (${estimatedBitrate}).`);
        if (isFullBuffer) {
          return await audioContext.decodeAudioData(arrayBuffer);
        }
        return null;
      }
      // Use knownTotalBytes if available, otherwise fall back to fileSize
      const totalBytesForCalculation = knownTotalBytes !== undefined ? knownTotalBytes : fileSize;
      const estimatedTotalDuration = ((totalBytesForCalculation - audioOffset) * 8) / estimatedBitrate;
      const partialTrackState: TrackState = {
        audioBuffer: decodedFirstChunk,
        duration: estimatedTotalDuration,
        trackLength: estimatedTotalDuration,
        title,
        coverArtUrl,
        transitionPoints,
        sourceNode: null,
        gainNode: null,
      };
      tracks.set(trackId, partialTrackState);

      console.log(`🎵 Early playback ready for '${trackId}' - ${chunkDuration.toFixed(2)}s decoded (estimated total: ${estimatedTotalDuration.toFixed(2)}s)`);
      window.dispatchEvent(
        new CustomEvent("trackPartiallyLoaded", {
          detail: { trackId, partialDuration: chunkDuration, estimatedTotal: estimatedTotalDuration, loadedBytes: bytesForFrames, totalBytes: totalBytesForCalculation },
        }),
      );

      if (isFullBuffer) {
        (async () => {
          try {
            const fullAudioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            const { title: refreshedTitle, coverArtUrl: refreshedCoverArtUrl } = await parseMetadataAndUpdate(arrayBuffer, title, coverArtUrl);

            const existingState = tracks.get(trackId);

            if (existingState) {
              existingState.audioBuffer = fullAudioBuffer;
              existingState.duration = fullAudioBuffer.duration;
              existingState.trackLength = fullAudioBuffer.duration;
              existingState.isFullyLoaded = true; // Mark as fully loaded
              existingState.title = refreshedTitle;
              existingState.coverArtUrl = refreshedCoverArtUrl;

              // Note: Buffer is updated in background, will be used for next playback
            } else {
              const newTrackState = createTrackState(fullAudioBuffer, { title: refreshedTitle, coverArtUrl: refreshedCoverArtUrl, transitionPoints });
              newTrackState.isFullyLoaded = true; // Mark as fully loaded
              tracks.set(trackId, newTrackState);
            }

            console.log(`✅ Full decode complete for '${trackId}' - ${fullAudioBuffer.duration.toFixed(2)}s (actual duration)`);
            window.dispatchEvent(new CustomEvent("trackFullyLoaded", { detail: { trackId, fullDuration: fullAudioBuffer.duration, totalBytes: totalBytesForCalculation } }));
          } catch (e) {
            console.error(`Failed to decode full audio for '${trackId}':`, e);
          }
        })().catch((e) => console.error(`[audio-crossfader] Unhandled error in full audio decode background task for '${trackId}':`, e));
      }

      return decodedFirstChunk;
    } catch (e) {
      console.warn(`Failed to decode the first frame chunk of '${trackId}', falling back to full decode:`, e);
      if (isFullBuffer) {
        return await audioContext.decodeAudioData(arrayBuffer);
      }
      return null;
    }
  } catch (e) {
    console.error(`Streaming decode failed for '${trackId}':`, e);
    cleanupTrackState(trackId);
    return null;
  }
}

/**
 * Handles streaming download of audio files, starting playback as soon as enough data is available.
 */
async function handleStreamingDownload(response: Response, trackId: string, transitionPoints?: number[], justDownload: boolean = false): Promise<boolean> {
  if (!justDownload) {
    if (!audioContext || !response.body) {
      console.error("handleStreamingDownload: AudioContext or response body not available");
      cleanupTrackState(trackId);
      return false;
    }
  }

  // Extract total file size from Content-Length header if available
  const contentLengthHeader = response.headers.get("Content-Length");
  const knownTotalBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : undefined;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytesReceived = 0;
  let hasStartedPlayback = false;
  let coverArtUrl: string | undefined;
  let title = trackId;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      if (value) {
        chunks.push(value);
        totalBytesReceived += value.length;

        // Try to start early playback once we have enough data (but only if not in justDownload mode)
        // For justDownload mode, we'll parse metadata early but continue downloading the full file
        if (!hasStartedPlayback && totalBytesReceived >= STREAMING_FILE_SIZE_THRESHOLD) {
          try {
            // Combine chunks into a single array buffer
            const combinedArray = combineChunks(chunks);

            // Parse metadata from the available data
            const metadata = await parseMetadataAndUpdate(combinedArray, title, coverArtUrl);
            title = metadata.title;
            coverArtUrl = metadata.coverArtUrl;

            /* ── just download mode ───────────────────────────────────── */
            if (justDownload) {
              // For justDownload mode, parse metadata early but continue downloading
              // We'll create a partial track state and update it when download completes
              tracks.set(trackId, {
                coverArtUrl: coverArtUrl || "",
                title,
                trackLength: metadata.duration || 0,
                duration: metadata.duration || 0,
                sourceNode: null,
                gainNode: null,
                rawBuffer: combinedArray.buffer, // Store partial buffer for now
                isFullyLoaded: false,
              });
              console.log(
                `📋 Metadata parsed for '${trackId}' (${(combinedArray.buffer.byteLength / 1024 / 1024).toFixed(2)} MB partial, continuing download for full file)${metadata.duration ? ` - Duration: ${metadata.duration.toFixed(2)}s` : ""}`,
              );
              hasStartedPlayback = true; // Mark as started to avoid re-parsing
              // Continue downloading the rest of the file
            } else {
              // Normal streaming playback mode
              const audioBuffer = await streamingDecodeAudioData(audioContext, combinedArray.buffer, trackId, title, coverArtUrl || "", transitionPoints, false, knownTotalBytes);

              if (audioBuffer) {
                hasStartedPlayback = true;
                console.log(`🎵 Early streaming playback started for '${trackId}' with ${totalBytesReceived} bytes received`);

                // Continue downloading in the background for the full file
                downloadRemainingDataInBackground(reader, chunks, trackId, title, coverArtUrl || "", transitionPoints).catch((error) => {
                  console.error(`Error downloading remaining data for '${trackId}':`, error);
                });
                return true;
              }
            }
          } catch (earlyPlaybackError) {
            console.warn(`Early playback failed for '${trackId}':`, earlyPlaybackError);
            // Continue downloading to try full decode later
          }
        }
      }
    }

    // If we reach here, download is complete but early playback didn't start
    // Combine all chunks and process normally
    const finalArray = combineChunks(chunks);

    // Parse metadata if not already done
    let metadata;
    if (!hasStartedPlayback) {
      metadata = await parseMetadataAndUpdate(finalArray, title, coverArtUrl);
      title = metadata.title;
      coverArtUrl = metadata.coverArtUrl;
    }

    /* ── just download mode ───────────────────────────────────── */
    if (justDownload) {
      // For justDownload mode, update the existing track state with the complete file
      const existingState = tracks.get(trackId);
      if (existingState) {
        // Update the existing state with the complete buffer
        existingState.rawBuffer = finalArray.buffer;
        console.log(
          `✅ Downloaded complete '${trackId}' (${(finalArray.buffer.byteLength / 1024 / 1024).toFixed(2)} MB total) - ready for later decoding${existingState.duration ? ` - Duration: ${existingState.duration.toFixed(2)}s` : ""}`,
        );
      } else {
        // Store the complete raw array buffer for later decoding with metadata duration
        tracks.set(trackId, {
          coverArtUrl: coverArtUrl || "",
          title,
          trackLength: metadata?.duration || 0,
          duration: metadata?.duration || 0,
          sourceNode: null,
          gainNode: null,
          rawBuffer: finalArray.buffer,
          isFullyLoaded: false,
        });
        console.log(
          `✅ Downloaded complete '${trackId}' (${(finalArray.buffer.byteLength / 1024 / 1024).toFixed(2)} MB total) - ready for later decoding${metadata?.duration ? ` - Duration: ${metadata.duration.toFixed(2)}s` : ""}`,
        );
      }
      return true;
    }

    // Process the complete file
    const audioBuffer = await streamingDecodeAudioData(audioContext, finalArray.buffer, trackId, title, coverArtUrl || "", transitionPoints, true, knownTotalBytes);

    if (audioBuffer) {
      if (!hasStartedPlayback) {
        console.log(`✅ Full file streaming decode completed for '${trackId}' - ${totalBytesReceived} bytes`);
      }
      return true;
    }

    // Fall back to regular decode if streaming decode fails
    const { title: refreshedTitle, coverArtUrl: refreshedCoverArtUrl } = await parseMetadataAndUpdate(finalArray, title, coverArtUrl);
    const regularBuffer = await audioContext.decodeAudioData(finalArray.buffer);
    const trackState = createTrackState(regularBuffer, { title: refreshedTitle, coverArtUrl: refreshedCoverArtUrl, transitionPoints });
    tracks.set(trackId, trackState);

    console.log(`✅ Fallback decode completed for '${trackId}' - ${regularBuffer.duration.toFixed(2)}s`);
    return true;
  } catch (error) {
    console.error(`Streaming download failed for '${trackId}':`, error);
    cleanupTrackState(trackId);
    return false;
  }
}

/**
 * Continues downloading remaining data in the background after early playback has started
 */
async function downloadRemainingDataInBackground(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  existingChunks: Uint8Array[],
  trackId: string,
  title: string,
  coverArtUrl: string,
  transitionPoints?: number[],
): Promise<void> {
  if (!audioContext) return;

  try {
    let totalBytesReceived = existingChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const allChunks = [...existingChunks];

    // Continue reading the remaining data
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      if (value) {
        allChunks.push(value);
        totalBytesReceived += value.length;
      }
    }

    // Combine all chunks to create the complete file
    const completeArray = combineChunks(allChunks);

    // Decode the complete audio buffer
    const fullAudioBuffer = await audioContext.decodeAudioData(completeArray.buffer);
    const existingState = tracks.get(trackId);

    // Re-parse metadata from the full file to ensure title/cover art are up-to-date.
    const { title: refreshedTitle, coverArtUrl: refreshedCoverArtUrl } = await parseMetadataAndUpdate(
      completeArray,
      existingState?.title || title,
      existingState?.coverArtUrl || coverArtUrl,
    );

    if (existingState) {
      // Update the existing partial state with the full buffer and refreshed metadata
      existingState.audioBuffer = fullAudioBuffer;
      existingState.duration = fullAudioBuffer.duration;
      existingState.trackLength = fullAudioBuffer.duration;
      existingState.isFullyLoaded = true; // Mark as fully loaded
      existingState.title = refreshedTitle;
      existingState.coverArtUrl = refreshedCoverArtUrl;

      console.log(`✅ Background download complete for '${trackId}' - ${fullAudioBuffer.duration.toFixed(2)}s (${totalBytesReceived} bytes)`);
      window.dispatchEvent(new CustomEvent("trackFullyLoaded", { detail: { trackId, fullDuration: fullAudioBuffer.duration, totalBytes: totalBytesReceived } }));
    } else {
      // Create new complete track state with refreshed metadata
      const newTrackState = createTrackState(fullAudioBuffer, { title: refreshedTitle, coverArtUrl: refreshedCoverArtUrl, transitionPoints });
      newTrackState.isFullyLoaded = true; // Also mark as fully loaded
      tracks.set(trackId, newTrackState);

      console.log(`✅ Background download and decode complete for '${trackId}' - ${fullAudioBuffer.duration.toFixed(2)}s`);
      window.dispatchEvent(new CustomEvent("trackFullyLoaded", { detail: { trackId, fullDuration: fullAudioBuffer.duration, totalBytes: totalBytesReceived } }));
    }
  } catch (error) {
    console.error(`Background download failed for '${trackId}':`, error);
  }
}

/* MAIN ------------------------------------------------------------------ */
export async function loadTrack(trackId: string, transitionPoints?: number[], enableStreaming: boolean = true, justDownload: boolean = false): Promise<boolean> {
  /* 1 ▸ make sure AudioContext is alive ---------------------------- */
  if (!justDownload) {
    if (!audioContext && !(await initAudioContext())) {
      console.error("loadTrack: AudioContext could not be initialized.");
      return false;
    }
  }

  /* 2 ▸ cache hit? ------------------------------------------------- */
  const cached = tracks.get(trackId);
  if (cached?.isFullyLoaded) {
    // If the track is fully loaded, just update transition points if needed and return.
    if (transitionPoints && cached.transitionPoints !== transitionPoints) {
      cached.transitionPoints = transitionPoints;
    }
    console.log(`✅ Track '${trackId}' already loaded from cache (fully)`);
    return true;
  }

  // If we have a buffer but it's not marked as fully loaded, it's a partial buffer.
  // We can still use it for playback, so we log it and return true.
  // The full buffer will be loaded in the background.
  if (cached?.audioBuffer) {
    if (transitionPoints && cached.transitionPoints !== transitionPoints) {
      cached.transitionPoints = transitionPoints;
    }
    console.log(`✅ Track '${trackId}' already loaded from cache (partially)`);
    return true;
  }

  // If we have a raw buffer (from justDownload), we need to decode it first
  if (cached?.rawBuffer && !justDownload) {
    console.log(`🔄 Track '${trackId}' has raw buffer, decoding...`);
    const decoded = await decodeDownloadedTrack(trackId, transitionPoints);
    if (decoded) {
      console.log(`✅ Track '${trackId}' decoded from raw buffer successfully`);
      return true;
    } else {
      console.error(`❌ Failed to decode raw buffer for '${trackId}'`);
      return false;
    }
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

    // Check if we can use streaming for this file
    const contentLength = res.headers.get("content-length");
    const fileSize = contentLength ? parseInt(contentLength, 10) : 0;
    const canStream = enableStreaming && fileSize > STREAMING_FILE_SIZE_THRESHOLD && res.body;

    if (canStream) {
      // Start streaming download and early playback
      return await handleStreamingDownload(res, trackId, transitionPoints, justDownload);
    } else {
      // Fall back to traditional download for small files or when streaming is disabled
      arrayBuffer = await res.arrayBuffer();
      if (!arrayBuffer.byteLength) throw new Error("Empty file");
    }
  } catch (e) {
    console.error(`❌ Fetch error for '${trackId}':`, e);
    cleanupTrackState(trackId);
    return false;
  }

  /* 4 ▸ parse metadata & streaming decode -------------------------- */
  let coverArtUrl: string | undefined;
  try {
    /* ── 4a metadata (ID3) ───────────────────────────────────────── */
    const { title, coverArtUrl: newCoverArtUrl, duration } = await parseMetadataAndUpdate(arrayBuffer, trackId);
    coverArtUrl = newCoverArtUrl;

    /* ── 4b just download mode ───────────────────────────────────── */
    if (justDownload) {
      // Store the raw array buffer for later decoding with metadata duration
      tracks.set(trackId, {
        coverArtUrl: coverArtUrl || "",
        title,
        trackLength: duration || 0,
        duration: duration || 0,
        sourceNode: null,
        gainNode: null,
        rawBuffer: arrayBuffer,
        isFullyLoaded: false,
      });
      console.log(
        `✅ Downloaded '${trackId}' (${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)} MB) - ready for later decoding${duration ? ` - Duration: ${duration.toFixed(2)}s` : ""}`,
      );
      return true;
    }

    /* ── 4b streaming decode ─────────────────────────────────────── */
    if (enableStreaming && arrayBuffer.byteLength > STREAMING_FILE_SIZE_THRESHOLD) {
      // Use streaming for files larger than threshold
      if (!audioContext) {
        console.error("AudioContext became null during streaming setup");
        cleanupTrackState(trackId);
        return false;
      }
      const audioBuffer = await streamingDecodeAudioData(audioContext, arrayBuffer, trackId, title, coverArtUrl || "", transitionPoints, true, arrayBuffer.byteLength);
      if (audioBuffer) {
        console.log(`✅ Streaming decoded '${trackId}' – ${audioBuffer.duration.toFixed(2)} s` + (transitionPoints ? ` | transitions: ${transitionPoints.join(", ")}` : ""));
        return true;
      }
      // Fall back to regular decode if streaming failed
      console.warn(`⚠️ Streaming decode failed for '${trackId}', falling back to regular decode`);
    } else if (enableStreaming && arrayBuffer.byteLength <= STREAMING_FILE_SIZE_THRESHOLD) {
      // For smaller files, still use streaming but with immediate full decode
      if (!audioContext) {
        console.error("AudioContext became null during streaming setup");
        cleanupTrackState(trackId);
        return false;
      }

      // For small files, decode immediately but still use streaming infrastructure for consistency
      try {
        const fullAudioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        const trackState = createTrackState(fullAudioBuffer, { title, coverArtUrl: coverArtUrl || "", transitionPoints });
        tracks.set(trackId, trackState);

        // Dispatch both events for small files to maintain compatibility
        window.dispatchEvent(
          new CustomEvent("trackPartiallyLoaded", {
            detail: {
              trackId,
              partialDuration: fullAudioBuffer.duration,
              estimatedTotal: fullAudioBuffer.duration,
              loadedBytes: arrayBuffer.byteLength,
              totalBytes: arrayBuffer.byteLength,
            },
          }),
        );

        window.dispatchEvent(new CustomEvent("trackFullyLoaded", { detail: { trackId, fullDuration: fullAudioBuffer.duration, totalBytes: arrayBuffer.byteLength } }));

        console.log(
          `✅ Small file decoded immediately '${trackId}' – ${fullAudioBuffer.duration.toFixed(2)} s` + (transitionPoints ? ` | transitions: ${transitionPoints.join(", ")}` : ""),
        );
        return true;
      } catch (e) {
        console.warn(`⚠️ Small file decode failed for '${trackId}', falling back to regular decode:`, e);
      }
    }

    /* ── 4c regular decode (fallback or small files) ──────────────── */
    const audioBuffer = await audioContext!.decodeAudioData(arrayBuffer);

    /* 5 ▸ cache & done ---------------------------------------------- */
    const trackState = createTrackState(audioBuffer, { title, coverArtUrl: coverArtUrl || "", transitionPoints });
    tracks.set(trackId, trackState);

    // Dispatch trackFullyLoaded event for regular decode path
    window.dispatchEvent(new CustomEvent("trackFullyLoaded", { detail: { trackId, fullDuration: audioBuffer.duration, totalBytes: arrayBuffer.byteLength } }));

    console.log(`✅ Decoded '${trackId}' – ${audioBuffer.duration.toFixed(2)} s` + (transitionPoints ? ` | transitions: ${transitionPoints.join(", ")}` : ""));
    return true;
  } catch (e) {
    console.error(`❌ metadata/decode error for '${trackId}':`, e);
    cleanupTrackState(trackId);
    return false;
  }
}

/**
 * Decode a track that was previously downloaded with justDownload: true
 * This function will decode the raw buffer and update the track state
 */
export async function decodeDownloadedTrack(trackId: string, transitionPoints?: number[]): Promise<boolean> {
  const trackState = tracks.get(trackId);
  if (!trackState?.rawBuffer) {
    console.error(`No raw buffer found for track '${trackId}'`);
    return false;
  }

  if (!audioContext && !(await initAudioContext())) {
    console.error("decodeDownloadedTrack: AudioContext could not be initialized.");
    return false;
  }

  try {
    // Parse metadata from the raw buffer
    const { title, coverArtUrl } = await parseMetadataAndUpdate(trackState.rawBuffer, trackId);

    // Decode the audio data
    const audioBuffer = await audioContext!.decodeAudioData(trackState.rawBuffer);

    // Update the track state with the decoded buffer
    const updatedTrackState = createTrackState(audioBuffer, { title, coverArtUrl: coverArtUrl || trackState.coverArtUrl, transitionPoints });

    // Remove the raw buffer since we no longer need it
    const rawBufferSize = trackState.rawBuffer.byteLength;
    delete updatedTrackState.rawBuffer;

    tracks.set(trackId, updatedTrackState);

    // Dispatch trackFullyLoaded event for decoded downloaded track
    window.dispatchEvent(new CustomEvent("trackFullyLoaded", { detail: { trackId, fullDuration: audioBuffer.duration, totalBytes: rawBufferSize } }));

    console.log(`✅ Decoded downloaded track '${trackId}' – ${audioBuffer.duration.toFixed(2)} s` + (transitionPoints ? ` | transitions: ${transitionPoints.join(", ")}` : ""));
    return true;
  } catch (e) {
    console.error(`❌ Decode error for downloaded track '${trackId}':`, e);
    return false;
  }
}

/**
 * Check if a track has been downloaded but not yet decoded
 */
export function isTrackDownloaded(trackId: string): boolean {
  const trackState = tracks.get(trackId);
  return !!(trackState?.rawBuffer && !trackState.audioBuffer);
}

function playTrack(trackId: string, startTime: number = 0, offset: number = 0, skipStopInternal: boolean = false, initialGain: number = 1.0): boolean {
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
  gainNode.gain.value = initialGain;

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

  // For partial buffers, listen for the full buffer to be ready and schedule continuation
  const isPartialBuffer = state.audioBuffer && state.trackLength && state.audioBuffer.duration < state.trackLength - 0.5;
  try {
    const dbgTrackLen = typeof state.trackLength === "number" ? state.trackLength.toFixed(3) : "n/a";
    console.log(
      `[PLAY] '${trackId}': now=${audioContext.currentTime.toFixed(3)} start=${startTime.toFixed(3)} offset=${offset.toFixed(3)} initialGain=${initialGain} | isPartial=${!!isPartialBuffer} bufDur=${state.audioBuffer.duration.toFixed(3)} trackLen=${dbgTrackLen}`,
    );
  } catch {}
  if (isPartialBuffer) {
    const partialEndTime = startTime + state.audioBuffer.duration;
    const originalPartialDuration = state.audioBuffer.duration; // Store the original partial duration
    let continuationScheduled = false;
    console.log(
      `[CONT] '${trackId}': partial detected. partialEnd=${partialEndTime.toFixed(3)} origPartial=${originalPartialDuration.toFixed(3)} now=${audioContext.currentTime.toFixed(3)}`,
    );

    const scheduleContinuation = () => {
      if (continuationScheduled) return;

      const currentState = tracks.get(trackId);
      console.log(`[CONT] scheduleContinuation invoked for '${trackId}' (now=${audioContext.currentTime.toFixed(3)})`);
      console.log(
        `scheduleContinuation check: trackId=${trackId}, currentTrackId=${currentTrackId}, hasBuffer=${!!currentState?.audioBuffer}, bufferDuration=${currentState?.audioBuffer?.duration}, originalPartialDuration=${originalPartialDuration}`,
      );

      // Check if we have a full buffer (duration is significantly larger than the original partial)
      if (currentState?.isFullyLoaded && currentState.audioBuffer) {
        const timeUntilEnd = partialEndTime - audioContext.currentTime;
        const isCurrentTrack = trackId === currentTrackId;
        const hasCorrectSource = tracks.get(trackId)?.sourceNode === source;

        console.log(
          `[CONT] timing: dt=${timeUntilEnd.toFixed(3)}s | isCurrent=${isCurrentTrack} hasCorrectSource=${hasCorrectSource} partialEnd=${partialEndTime.toFixed(3)} now=${audioContext.currentTime.toFixed(3)}`,
        );
        console.log(
          `Continuation timing: timeUntilEnd=${timeUntilEnd.toFixed(3)}s, isCurrentTrack=${isCurrentTrack}, hasCorrectSource=${hasCorrectSource}, partialEndTime=${partialEndTime.toFixed(3)}, currentTime=${audioContext.currentTime.toFixed(3)}`,
        );

        if (isCurrentTrack && hasCorrectSource) {
          console.log(`Scheduling seamless continuation for '${trackId}' at ${partialEndTime.toFixed(3)}s with ${timeUntilEnd.toFixed(3)}s remaining`);
          continuationScheduled = true;

          // Create the continuation source
          const contSource = audioContext.createBufferSource();
          const contGainNode = audioContext.createGain();
          contSource.buffer = currentState.audioBuffer;
          contSource.loop = false;
          contGainNode.gain.value = 1.0;

          // Connect continuation through the SAME track-level gain node so crossfade envelope carries over
          // Chain: contSource -> contGainNode -> track-level gainNode -> background/master
          contSource.connect(contGainNode);
          contGainNode.connect(gainNode);

          // Start the continuation slightly before the partial ends with zero volume, then fade in
          const overlapDuration = 0.05; // 50ms overlap
          const continuationStartTime = partialEndTime - overlapDuration;
          const continuationOffset = Math.max(0, originalPartialDuration - overlapDuration);

          console.log(`Starting continuation: startTime=${continuationStartTime.toFixed(3)}, offset=${continuationOffset.toFixed(3)}, with ${overlapDuration}s overlap`);
          console.log(`[CONT] ramps: contGain 0->1 from ${continuationStartTime.toFixed(3)} to ${partialEndTime.toFixed(3)} | partialGain 1->0 over same interval`);

          // Start at zero volume
          contGainNode.gain.value = 0;
          contSource.start(continuationStartTime, continuationOffset);

          // Fade in the continuation locally (50ms overlap) while preserving track-level envelope
          contGainNode.gain.setValueAtTime(0, continuationStartTime);
          contGainNode.gain.linearRampToValueAtTime(1, partialEndTime);

          // NOTE: Do NOT manipulate the track-level gainNode here; it controls the overall crossfade envelope.
          // We avoid fading it to 0 to prevent muting the continuation which also flows through this node.

          // Update track state to point to the continuation source (gainNode remains the same track-level node)
          currentState.sourceNode = contSource;
          currentState.startedAtCtxTime = continuationStartTime;
          currentState.offsetAtStart = continuationOffset;

          liveSources.add(contSource);

          // Set up normal onended for the continuation
          contSource.onended = () => {
            liveSources.delete(contSource);
            const endState = tracks.get(trackId);
            if (trackId === currentTrackId && !isTransitioning && endState?.sourceNode === contSource) {
              if (currentSectionTracks && currentSectionTracks.length > 0) {
                playNextTrackInSection();
              } else {
                currentTrackId = null;
                currentTrackIndexInSection = -1;
              }
            }
          };
        } else {
          console.log(`Cannot schedule continuation: isCurrentTrack=${isCurrentTrack}, hasCorrectSource=${hasCorrectSource}`);
        }
      } else {
        console.log(`Full buffer not ready: hasBuffer=${!!currentState?.audioBuffer}, duration comparison=${currentState?.audioBuffer?.duration} > ${originalPartialDuration} + 1`);
      }
    };

    // Listen for the full buffer to be ready
    const handleTrackFullyLoaded = (event: CustomEvent) => {
      if (event.detail.trackId === trackId) {
        scheduleContinuation();
        window.removeEventListener("trackFullyLoaded", handleTrackFullyLoaded);
        const state = tracks.get(trackId);
        if (state) {
          state.fullyLoadedListener = null;
        }
      }
    };
    state.fullyLoadedListener = handleTrackFullyLoaded;
    window.addEventListener("trackFullyLoaded", handleTrackFullyLoaded);

    // Also try immediately in case it's already ready
    scheduleContinuation();
  }

  source.onended = async () => {
    liveSources.delete(source);

    const stateAtEnd = tracks.get(trackId);

    // If this was a partial buffer and we scheduled a continuation, don't do normal onended processing
    const wasPartialBuffer = isPartialBuffer;
    if (wasPartialBuffer && trackId === currentTrackId) {
      console.log(`[CONT] onended reached for partial '${trackId}'`);
      console.log(`Partial buffer ended for '${trackId}', continuation should be playing`);
      return; // Let the continuation handle everything
    }

    // This check ensures that only the 'onended' handler for the *current* official source node proceeds.
    const thisSourceInstanceEnded = stateAtEnd?.sourceNode === source;

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
        `onended for '${trackId}': Conditions not met for auto-play next. currentTrackId: ${currentTrackId}, isTransitioning: ${isTransitioning}, thisSourceInstanceEnded: ${thisSourceInstanceEnded}`,
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
          // Capture current audioContext
          if (!audioContext) return;

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
        // Ensure playlist UI reflects the full active section, not just the current track
        dispatchPlaylistChangeEvent().catch(console.error);
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

  // Ensure the 'trackFullyLoaded' listener is removed if the track is stopped prematurely
  if (state.fullyLoadedListener) {
    window.removeEventListener("trackFullyLoaded", state.fullyLoadedListener);
    state.fullyLoadedListener = null;
    console.log(`Cleaned up 'trackFullyLoaded' listener for '${trackId}'.`);
  }
  // Note: Cover art URLs are NOT revoked here to preserve them for potential resume
  // They will be revoked when the track is completely removed from the cache

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

async function performCrossfade(fadeOutId: string, fadeInId: string, transitionStartTime: number, fadeInOffset: number = 0) {
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
  console.log(`[XFADE] t(now)=${audioContext.currentTime.toFixed(3)} | start=${transitionStartTime.toFixed(3)} | offset=${fadeInOffset.toFixed(3)}`);
  // Invalidate prior crossfade and assign a new token
  currentCrossfadeId += 1;
  const thisCrossfadeId = currentCrossfadeId;
  // Do not cancel the previous cleanup timer: it will run stale-safe cleanup.
  isTransitioning = true;
  nextTrackId = fadeInId;

  const fadeDuration = fadeInOffset > 0 ? MINI_FADE_DURATION_S : FADE_DURATION_SECONDS;
  const now = audioContext.currentTime;
  const safeStart = Math.max(transitionStartTime, now + 0.02);
  const fadeEnd = safeStart + fadeDuration;
  if (safeStart !== transitionStartTime) {
    console.log(`[XFADE] start clamped: requested=${transitionStartTime.toFixed(3)} -> safeStart=${safeStart.toFixed(3)} (now=${now.toFixed(3)})`);
  }
  console.log(`[XFADE] fadeDuration=${fadeDuration.toFixed(3)} | fadeEnd=${fadeEnd.toFixed(3)}`);

  // ---------- fade-OUT ramp ----------
  const gOut = fadeOutState.gainNode.gain;
  const oldSourceNode = fadeOutState.sourceNode;
  const oldGainNode = fadeOutState.gainNode;
  console.log(`[XFADE] OUT ramp: from=${gOut.value} -> 0 @ ${fadeEnd.toFixed(3)} (now=${now.toFixed(3)})`);
  gOut.cancelScheduledValues(now);
  gOut.setValueAtTime(gOut.value, now);
  gOut.linearRampToValueAtTime(0, fadeEnd);

  // ---------- fade-IN preparation ----------
  // Re-enable streaming for fade-in; seam is now handled via shared track-level gain
  const loaded = await loadTrack(fadeInId);
  if (!loaded) {
    console.error(`performCrossfade: Failed to ensure ${fadeInId} is loaded. Aborting crossfade.`);
    gOut.cancelScheduledValues(audioContext.currentTime);
    gOut.linearRampToValueAtTime(1, audioContext.currentTime + 0.2);
    // Abort only if this crossfade is still the active one
    if (thisCrossfadeId === currentCrossfadeId) {
      isTransitioning = false;
      nextTrackId = null;
    }
    return;
  }

  // playTrack creates the new source and gain nodes. We want it to start at 0 volume.
  console.log(`[XFADE] Scheduling playTrack(fadeInId=${fadeInId}) @ start=${safeStart.toFixed(3)} offset=${fadeInOffset.toFixed(3)} (now=${audioContext.currentTime.toFixed(3)})`);
  if (!playTrack(fadeInId, safeStart, fadeInOffset, fadeOutId === fadeInId, 0)) {
    console.error(`performCrossfade: Failed to schedule playTrack for fadeInId: ${fadeInId}. Aborting crossfade.`);
    gOut.cancelScheduledValues(audioContext.currentTime);
    gOut.linearRampToValueAtTime(1, audioContext.currentTime + 0.2);
    if (thisCrossfadeId === currentCrossfadeId) {
      isTransitioning = false;
      nextTrackId = null;
    }
    return;
  }

  const fadeInGainNode = tracks.get(fadeInId)?.gainNode;
  if (!fadeInGainNode) {
    console.error(`performCrossfade: GainNode for fadeInId ${fadeInId} not found after playTrack. Aborting.`);
    gOut.cancelScheduledValues(audioContext.currentTime);
    gOut.linearRampToValueAtTime(1, audioContext.currentTime + 0.2);
    stopTrackInternal(fadeInId);
    if (thisCrossfadeId === currentCrossfadeId) {
      isTransitioning = false;
      nextTrackId = null;
    }
    return;
  }

  // ---------- fade-IN ramp ----------
  const gIn = fadeInGainNode.gain;
  // Start silent, then ramp up. `setValueAtTime` is crucial for preventing clicks.
  console.log(`[XFADE] IN ramp: from=0 -> 1 | start=${safeStart.toFixed(3)} end=${fadeEnd.toFixed(3)} (now=${audioContext.currentTime.toFixed(3)})`);
  gIn.setValueAtTime(0, now);
  gIn.linearRampToValueAtTime(0, safeStart);
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
    // Ensure this cleanup corresponds to the still-active crossfade
    if (thisCrossfadeId !== currentCrossfadeId) {
      return; // Stale cleanup; a newer crossfade took over
    }
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
    // Clear active cleanup timer reference once finished
    if (activeCrossfadeTimeout) {
      clearTimeout(activeCrossfadeTimeout);
      activeCrossfadeTimeout = null;
    }

    // Auto-start first track of the newly applied section if nothing is playing or current track not in section
    try {
      if (currentSectionTracks && currentSectionTracks.length > 0) {
        const isCurrentInSection = currentTrackId ? currentSectionTracks.includes(currentTrackId) : false;
        const hasActiveSource = currentTrackId ? !!tracks.get(currentTrackId)?.sourceNode : false;
        const needAutoStart = !currentTrackId || !isCurrentInSection || !hasActiveSource;
        if (needAutoStart) {
          const firstTrackId = currentSectionTracks[0];
          console.log(
            `Auto-start check after crossfade: needStart=${needAutoStart}, current=${currentTrackId}, first='${firstTrackId}', inSection=${isCurrentInSection}, hasSource=${hasActiveSource}`,
          );
          (async () => {
            try {
              const started = await startFirstTrack(firstTrackId);
              if (started) {
                console.log(`Auto-started first track '${firstTrackId}' after crossfade completion.`);
              } else {
                console.warn(`Auto-start: Failed to start '${firstTrackId}' after crossfade completion.`);
              }
            } catch (e) {
              console.error(`Auto-start error for '${firstTrackId}' after crossfade:`, e);
            }
          })();
        }
      }
    } catch (e) {
      console.error("Auto-start decision error after crossfade:", e);
    }

    console.log("Crossfade transition fully completed and state updated.");
  };

  // 1) call finishCrossfade as soon as the ramp mathematically ends
  const msUntilFadeEnd = Math.max(0, fadeEnd - audioContext.currentTime) * 1000 + 50; // +50 ms cushion
  activeCrossfadeTimeout = setTimeout(finishCrossfade, msUntilFadeEnd);

  // 2) …and also if the old source ends earlier for any reason
  const sourceNodeToWatch = fadeOutId === fadeInId ? oldSourceNode : fadeOutState.sourceNode;
  if (sourceNodeToWatch) {
    // Always attempt cleanup; finishCrossfade will avoid touching globals if stale.
    sourceNodeToWatch.onended = () => {
      finishCrossfade();
    };
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

  const isFullyLoaded = tracks.get(trackId)?.isFullyLoaded;

  if (!isFullyLoaded && (!tracks.has(trackId) || !tracks.get(trackId)!.audioBuffer)) {
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
        console.log(`Started track ${trackId} at index ${currentTrackIndexInSection} in section [${currentSectionTracks.join(", ")}] at ${performance.now()}.`);
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

export async function transitionToTrack(targetId: string, options?: { manual?: boolean }): Promise<boolean> {
  console.log(`transitionToTrack: Attempting to transition to targetId='${targetId}'. Current: '${currentTrackId}', Transitioning: ${isTransitioning}, Next: '${nextTrackId}'`);
  if (!audioContext) {
    console.error("transitionToTrack: AudioContext not ready.");
    return false;
  }

  if (isTransitioning && nextTrackId === targetId) {
    console.log(`transitionToTrack: Already transitioning to '${targetId}'. Considered successful.`);
    return true;
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

  const isFullyLoaded = tracks.get(targetId)?.isFullyLoaded;
  if (!isFullyLoaded && (!tracks.has(targetId) || !tracks.get(targetId)!.audioBuffer)) {
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

  // If this is a user-initiated/manual transition, perform an immediate cut (no crossfade)
  if (options?.manual === true) {
    console.log(`transitionToTrack: Manual transition requested. Performing immediate cut to '${targetId}'.`);
    const oldTrackId = currentTrackId;
    // Stop current track immediately
    stopTrackInternal(currentTrackId);
    currentTrackId = null;
    currentTrackIndexInSection = -1;

    const started = await startFirstTrack(targetId);
    if (started) {
      console.log(`transitionToTrack: Immediate cut from '${oldTrackId}' to '${targetId}' succeeded (manual).`);
    } else {
      console.warn(`transitionToTrack: Immediate cut from '${oldTrackId}', but failed to start '${targetId}' (manual).`);
    }
    return started;
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

  // Stop all tracks but preserve their state for potential resume
  tracks.forEach((state, id) => {
    stopTrackInternal(id);
  });

  currentTrackId = null;
  nextTrackId = null;
  isTransitioning = false;
  // Invalidate any active crossfade and cancel its timer
  currentCrossfadeId += 1;
  if (activeCrossfadeTimeout) {
    clearTimeout(activeCrossfadeTimeout);
    activeCrossfadeTimeout = null;
  }
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
  return Math.pow(scaledVolume, 1 / VOLUME_SCALE);
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
    trackPartiallyLoaded: CustomEvent<{ trackId: string; partialDuration: number; estimatedTotal: number; loadedBytes: number; totalBytes: number }>;
    trackFullyLoaded: CustomEvent<{ trackId: string; fullDuration: number; totalBytes: number }>;
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
