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

/**
 * Completely tear down the player runtime:
 * - Stop and clear audio playback, close AudioContext
 * - Clear legacy DOM containers and media elements
 * - Clear the player portal root
 */
export async function teardownPlayer(): Promise<void> {
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
      v.pause();
      // Remove any sources
      v.removeAttribute("src");
      // If there are <source> children, remove them
      const sources = v.querySelectorAll("source");
      sources.forEach((s) => s.remove());
      // Force the element to reset its state
      v.load();
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
    const bgB = document.getElementById("bg-image-b") as HTMLElement | null;
    if (bgA) bgA.style.backgroundImage = "";
    if (bgB) bgB.style.backgroundImage = "";

    // Remove visibility class from book container
    const bookContainer = document.getElementById("book-container");
    if (bookContainer) bookContainer.classList.remove("visible");
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
}
