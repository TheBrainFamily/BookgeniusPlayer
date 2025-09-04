import { stopAllPlayback, getAudioContext } from "./audio-crossfader";
import { clearBookDataCache } from "@player/genericBookDataGetters/getBookData";
import { clearAllVariantsCache } from "@player/genericBookDataGetters/getAllVariants";
import { clearAudiobookTracksCache } from "@player/genericBookDataGetters/getAudiobookTracksForBook";
import { clearBackgroundSongsCache } from "@player/genericBookDataGetters/getBackgroundSongsForBook";
import { clearBackgroundsCache } from "@player/genericBookDataGetters/getBackgroundsForBook";
import { clearBookStringifiedCache } from "@player/genericBookDataGetters/getBookStringified";
import { clearCharactersDataCache } from "@player/genericBookDataGetters/getCharactersData";
import { clearCutScenesCache } from "@player/genericBookDataGetters/getCutScenesForBook";
import { clearKnownVideoFilesCache } from "@player/genericBookDataGetters/getKnownVideoFiles";
import { useSearchModal } from "@player/stores/modals/searchModal.store";
import { resetBackgroundDebouncer } from "./ui/background";

/**
 * Completely tear down the player runtime:
 * - Stop and clear audio playback, close AudioContext
 * - Clear legacy DOM containers and media elements
 * - Clear the player portal root
 */
export async function teardownPlayer(): Promise<void> {
  resetBackgroundDebouncer();

  try {
    // Stop all audio and clear state
    stopAllPlayback();
  } catch (e) {
    console.warn("teardownPlayer: stopAllPlayback failed", e);
  }

  try {
    const ac = getAudioContext();
    if (ac && typeof ac.suspend === "function") {
      try {
        await ac.suspend();
        // leave context instance intact so it can be resumed later
      } catch (e) {
        console.warn("teardownPlayer: AudioContext.suspend() failed", e);
      }
    }
  } catch (e) {
    console.warn("teardownPlayer: AudioContext access failed", e);
  }

  // Helper: clear element innerHTML if present
  const clearEl = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = "";
  };

  // Helper: pause and reset a video element
  const resetVideo = (id: string) => {
    const v = document.getElementById(id) as HTMLVideoElement | null;
    if (!v) return;

    try {
      // First, remove any event listeners to prevent errors during cleanup
      v.onloadstart = null;
      v.onloadeddata = null;
      v.oncanplay = null;
      v.onplay = null;
      v.onpause = null;
      v.onended = null;
      v.onerror = null;
      v.onabort = null;

      // If video is currently loading or playing, abort it gracefully
      if (v.readyState > 0) {
        try {
          v.pause();
        } catch (pauseError) {
          console.warn(`teardownPlayer: failed to pause video #${id}`, pauseError);
        }
      }

      // Reset time before removing source to avoid seeking errors
      try {
        v.currentTime = 0;
      } catch {
        // Ignore - video might not be loaded enough to seek
      }

      // Remove sources first, then src attribute
      const sources = v.querySelectorAll("source");
      sources.forEach((s) => s.remove());
      v.removeAttribute("src");
      v.srcObject = null;
      v.src = "";
      // video state reset across all browsers
      try {
        v.load();
      } catch (loadError) {
        console.warn(`teardownPlayer: video.load() failed for #${id}`, loadError);
      }
    } catch (e) {
      console.warn(`teardownPlayer: failed to reset video #${id}`, e);
    }
  };

  // Clear legacy DOM content
  try {
    clearEl("content-container");
    clearEl("left-notes");
    clearEl("right-notes");
    clearEl("right-notes-scrollable-container");

    const cutsceneText = document.getElementById("cutscene-text");
    if (cutsceneText) cutsceneText.textContent = "";

    // Reset background images
    const bgA = document.getElementById("bg-image-a") as HTMLElement | null;
    if (bgA) {
      bgA.style.backgroundImage = "";
      bgA.classList.remove("zooming");
      bgA.classList.add("faded");
    }
    const bgB = document.getElementById("bg-image-b") as HTMLElement | null;
    if (bgB) {
      bgB.style.backgroundImage = "";
      bgB.classList.remove("zooming");
      bgB.classList.add("faded");
    }

    const videoA = document.getElementById("bg-video-a") as HTMLElement | null;
    if (videoA) {
      videoA.style.zIndex = "-2";
      videoA.classList.add("faded");
    }
    const videoB = document.getElementById("bg-video-b") as HTMLElement | null;
    if (videoB) {
      videoB.style.zIndex = "-2";
      videoB.classList.add("faded");
    }

    // Remove visibility class from book container and reset state
    const bookContainer = document.getElementById("book-container");
    if (bookContainer) {
      bookContainer.classList.remove("visible");
      bookContainer.removeAttribute("data-current-book");
    }

    // Reset legacy background state - this is crucial for reinitializing backgrounds
    const legacy = document.getElementById("legacy");
    if (legacy) {
      legacy.dataset.currentFile = "";
      legacy.dataset.front = "";
      legacy.dataset.type = "";
    }
  } catch (e) {
    console.warn("teardownPlayer: clearing legacy DOM failed", e);
  }

  // Reset media elements
  try {
    resetVideo("bg-video-a");
    resetVideo("bg-video-b");
    resetVideo("cutscene-video");
  } catch (e) {
    console.warn("teardownPlayer: resetting videos failed", e);
  }

  // Ensure the portal mount is empty
  try {
    clearEl("root-player");
  } catch (e) {
    console.warn("teardownPlayer: clearing #root-player failed", e);
  }

  // Clear in-memory caches for current book so next entry reloads fresh
  try {
    clearBookDataCache();
    clearAllVariantsCache();
    clearAudiobookTracksCache();
    clearBackgroundSongsCache();
    clearBackgroundsCache();
    clearBookStringifiedCache();
    clearCharactersDataCache();
    clearCutScenesCache();
    clearKnownVideoFilesCache();
  } catch (e) {
    console.warn("teardownPlayer: clearing caches failed", e);
  }

  // Clear search results and close search modal when changing books
  try {
    useSearchModal.getState().closeModal();
    useSearchModal.getState().clearModal();
  } catch (e) {
    console.warn("teardownPlayer: clearing search results failed", e);
  }
}
