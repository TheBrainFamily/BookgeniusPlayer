import {
  transitionToTrack,
  loadTrack,
  initAudioContext, // Keep if used elsewhere, but dealWithBackgroundSongs relies on crossfader's init
  getCurrentTrackId,
  stopAllPlayback,
  setActiveSection,
  isCurrentTrackInSection,
  getCurrentSectionTracks,
} from "./audio-crossfader";
import { bookDataLoader } from "@/services/bookDataLoader";
import { getBackgroundSongsForBook } from "./genericBookDataGetters/getBackgroundSongsForBook";
import { getCurrentLocation } from "@/helpers/paragraphsNavigation";
import { BackgroundSongSection } from "./types/book";

let isProcessingBackgroundSongs = false; // Module-level flag to prevent re-entrancy

// Preload function - can be async if loadTrack is async (it is now)
export const preloadBackgroundTracks = async () => {
  console.log("Attempting to preload background tracks dynamically...");

  const audioContextReady = await initAudioContext();
  if (!audioContextReady) {
    console.warn("Cannot preload tracks, AudioContext not ready.");
    return false;
  }

  const location = getCurrentLocation();
  const currentChapter = location.currentChapter;
  const chaptersToPreloadAhead = 2;

  // Create array of chapters to consider: 1 behind (if not first chapter), current, and 2 ahead
  const chaptersToConsider: number[] = [];

  // Add 1 chapter behind if not the first chapter
  if (currentChapter > 1) {
    chaptersToConsider.push(currentChapter - 1);
  }

  // Add current chapter and 2 ahead
  for (let i = 0; i <= chaptersToPreloadAhead; i++) {
    chaptersToConsider.push(currentChapter + i);
  }
  console.log("Preloading tracks for chapters:", chaptersToConsider);

  const bookSongs = getBackgroundSongsForBook();
  if (!bookSongs) {
    console.log(`No song definitions found for book ${bookDataLoader.getCurrentBook()}. Cannot preload.`);
    return false;
  }

  const sectionsToPreload = bookSongs.filter((section) => chaptersToConsider.includes(section.chapter));

  if (sectionsToPreload.length === 0) {
    console.log("No background tracks found for the current chapter range to preload.");
    return false;
  }

  console.log(`Preloading ${sectionsToPreload.length} sections...`);
  const preloadPromises = sectionsToPreload.flatMap((section) => section.files.map((file) => loadTrack(file.replace(".mp3", ""))));

  // Wait for all tracks to load in parallel
  try {
    const results = await Promise.allSettled(preloadPromises);
    const successful = results.filter((result) => result.status === "fulfilled" && result.value === true).length;
    const failed = results.length - successful;

    console.log(`Dynamic background tracks preloading complete. Successfully loaded: ${successful}, Failed: ${failed}`);

    if (failed > 0) {
      const failedResults = results.filter((result) => result.status === "rejected" || (result.status === "fulfilled" && result.value === false));
      console.warn("Some tracks failed to preload:", failedResults);
    }

    return successful > 0;
  } catch (error) {
    console.error("Error during track preloading:", error);
    return false;
  }
};

interface DealWithBackgroundSongsParams {
  currentChapter: number;
  currentParagraph: number;
}

export const dealWithBackgroundSongs = async ({ currentChapter, currentParagraph }: DealWithBackgroundSongsParams): Promise<void> => {
  console.log("PONTON deal with background songs");
  if (isProcessingBackgroundSongs) {
    console.log("dealWithBackgroundSongs: Already processing, skipping this call.");
    return;
  }
  isProcessingBackgroundSongs = true;

  console.log("dealWithBackgroundSongs invoked with:", { currentChapter, currentParagraph });

  try {
    console.log(`Calculated consideration point: Chapter ${currentChapter}, Paragraph ${currentParagraph}`);

    const bookSongs = getBackgroundSongsForBook();
    if (!bookSongs) {
      console.log(`No song definitions found for book ${bookDataLoader.getCurrentBook()}. Cannot determine background song.`);
      isProcessingBackgroundSongs = false; // Reset flag before early exit
      return;
    }

    const foundBackgroundSections = bookSongs
      .filter((section: BackgroundSongSection) => {
        return section.chapter < currentChapter || (section.chapter === currentChapter && section.paragraph <= currentParagraph);
      })
      .sort((a: BackgroundSongSection, b: BackgroundSongSection) => {
        if (b.chapter !== a.chapter) return b.chapter - a.chapter;
        return b.paragraph - a.paragraph;
      });

    const sectionToApply = foundBackgroundSections[0];

    if (sectionToApply && sectionToApply.files && sectionToApply.files.length > 0) {
      console.log("Applicable background section found:", sectionToApply);
      const sectionTrackIds = sectionToApply.files.map((f) => f.replace(".mp3", ""));
      const firstTrackIdInSection = sectionTrackIds[0];
      const currentPlayingTrackId = getCurrentTrackId(); // Get current from crossfader

      console.log(`Background song check: Section is [${sectionTrackIds.join(", ")}]. First track: ${firstTrackIdInSection}. Currently playing: ${currentPlayingTrackId}.`);

      // Inform the crossfader about the active section's tracks.
      // This call might be deferred if a transition is in progress in audio-crossfader.
      setActiveSection(sectionTrackIds);

      // Check if the currently playing track is already part of the *correct* and *active* section.
      // isCurrentTrackInSection checks against the audio-crossfader's *actual current* section.
      if (isCurrentTrackInSection(sectionTrackIds)) {
        console.log(`Current track ${currentPlayingTrackId} is already part of the active section [${sectionTrackIds.join(", ")}]. Letting sequence handler manage playback.`);
        // Do nothing - onended handler in audio-crossfader will play the next track if needed.
      } else {
        // If we're here, either nothing is playing, or the wrong track/section is playing,
        // or the section was just changed and the current track isn't in it.
        // Transition to the *first* track of the *correct* section.
        console.log(`Action: Transitioning/starting first track of new/correct section: ${firstTrackIdInSection}`);

        // Ensure the first track is loaded before transitioning (loadTrack handles if already loaded)
        const loaded = await loadTrack(firstTrackIdInSection /*, sectionToApply.transitionPoints */);
        if (loaded) {
          const success = await transitionToTrack(firstTrackIdInSection);
          if (!success) {
            console.warn(`dealWithBackgroundSongs: Failed to initiate transition/start for ${firstTrackIdInSection}. Audio-crossfader logs should have details.`);
          } else {
            console.log(`dealWithBackgroundSongs: Successfully initiated transition/start for ${firstTrackIdInSection}.`);
          }
        } else {
          console.error(`dealWithBackgroundSongs: Failed to load first track ${firstTrackIdInSection} of section. Cannot transition.`);
          // Consider stopping music if essential track fails to load
          // await stopAllPlayback(); // stopAllPlayback is currently sync
          stopAllPlayback();
        }
      }
    } else {
      console.log(`No background song section defined for current location (Ch ${currentChapter}, P ${currentParagraph}).`);
      // What to do if no section applies?
      // Option 1: Stop any current music if it's not part of *any* section (more complex to check)
      // Option 2: Let current music play out (current behavior if nothing transitions it)
      // Option 3: Explicitly stop if current track is not null and current section becomes null
      if (getCurrentTrackId() && !getActiveSectionTracks()) {
        // getActiveSectionTracks would be a new getter or use getCurrentSectionTracks()
        console.log("No applicable section, and a track is playing outside of any defined section. Stopping playback.");
        stopAllPlayback();
      } else if (!getCurrentTrackId() && !getActiveSectionTracks()) {
        console.log("No applicable section, and nothing is playing. Ensuring audio is silent.");
        setActiveSection(null); // Ensure no section is marked active
        // stopAllPlayback(); // redundant if nothing is playing, but safe.
      }
    }
  } catch (error) {
    console.error("Error during dealWithBackgroundSongs execution:", error);
    // Potentially stop all music on unhandled error to prevent broken states
    // stopAllPlayback();
  } finally {
    isProcessingBackgroundSongs = false;
  }
};

// Helper to get active section tracks for the logic in dealWithBackgroundSongs
function getActiveSectionTracks(): string[] | null {
  const currentSection = getCurrentSectionTracks(); // From audio-crossfader
  return currentSection;
}
