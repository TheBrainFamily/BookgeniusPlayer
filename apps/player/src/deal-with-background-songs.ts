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
import { getBackgroundSongsForBook, getBookSlug } from "./state/bookDataStore";
import { getCurrentLocation } from "@player/helpers/paragraphsNavigation";
import { BackgroundSongSection } from "./types/book";

let isProcessingBackgroundSongs = false; // Module-level flag to prevent re-entrancy

// Helper function to ensure audio context is ready
const ensureAudioContextReady = async (): Promise<boolean> => {
  const audioContextReady = await initAudioContext();
  if (!audioContextReady) {
    console.warn("Cannot preload tracks, AudioContext not ready.");
    return false;
  }
  return true;
};

// Helper function to get and validate book songs
const getValidatedBookSongs = (): BackgroundSongSection[] | null => {
  const bookSongs = getBackgroundSongsForBook();
  if (!bookSongs || bookSongs.length === 0) {
    console.log(`No song definitions found for book ${getBookSlug()}. Cannot preload.`);
    return null;
  }
  return bookSongs;
};

// Helper function to find applicable background sections for a location
const findApplicableBackgroundSections = (bookSongs: BackgroundSongSection[], currentChapter: number, currentParagraph: number): BackgroundSongSection[] => {
  return bookSongs
    .filter((section: BackgroundSongSection) => {
      return section.chapter < currentChapter || (section.chapter === currentChapter && section.paragraph <= currentParagraph);
    })
    .sort((a: BackgroundSongSection, b: BackgroundSongSection) => {
      if (b.chapter !== a.chapter) return b.chapter - a.chapter;
      return b.paragraph - a.paragraph;
    });
};

// Helper function to load a single track with error handling
const loadSingleTrackJustDownload = async (trackId: string, context: string): Promise<boolean> => {
  try {
    const loaded = await loadTrack(trackId, undefined, true, true);
    if (loaded) {
      console.log(`Successfully preloaded ${context} track: ${trackId}`);
      return true;
    } else {
      console.warn(`Failed to preload ${context} track: ${trackId}`);
      return false;
    }
  } catch (error) {
    console.error(`Error during ${context} track preloading:`, error);
    return false;
  }
};

// Helper function to load multiple tracks in parallel
const loadMultipleTracks = async (trackIds: string[], context: string): Promise<boolean> => {
  console.log(`Preloading ${trackIds.length} ${context} tracks...`);
  const preloadPromises = trackIds.map((trackId) => loadTrack(trackId));

  try {
    const results = await Promise.allSettled(preloadPromises);
    const successful = results.filter((result) => result.status === "fulfilled" && result.value === true).length;
    const failed = results.length - successful;

    console.log(`${context} tracks preloading complete. Successfully loaded: ${successful}, Failed: ${failed}`);

    if (failed > 0) {
      const failedResults = results.filter((result) => result.status === "rejected" || (result.status === "fulfilled" && result.value === false));
      console.warn(`Some ${context} tracks failed to preload:`, failedResults);
    }

    return successful > 0;
  } catch (error) {
    console.error(`Error during ${context} track preloading:`, error);
    return false;
  }
};

// Preload function - can be async if loadTrack is async (it is now)
export const preloadBackgroundTracks = async () => {
  console.log("Attempting to preload background tracks dynamically...");

  if (!(await ensureAudioContextReady())) {
    return false;
  }

  const location = getCurrentLocation();
  const currentChapter = location.currentChapter;
  const currentParagraph = location.currentParagraph;
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

  const bookSongs = getValidatedBookSongs();
  if (!bookSongs) {
    return false;
  }

  const sectionsToPreload = bookSongs.filter((section) => chaptersToConsider.includes(section.chapter));

  if (sectionsToPreload.length === 0) {
    console.log("No background tracks found for the current chapter range to preload.");
    return false;
  }

  // Find the applicable section for the current location
  const foundBackgroundSections = findApplicableBackgroundSections(bookSongs, currentChapter, currentParagraph);
  const currentSection = foundBackgroundSections[0];

  if (!currentSection || !currentSection.files || currentSection.files.length === 0) {
    console.log("No background track section found for current location.");
    return false;
  }

  // Get the first track of the current section
  const firstTrackId = currentSection.files[0].replace(".mp3", "");

  const trackIds = sectionsToPreload.flatMap((section) => section.files.map((file) => file.replace(".mp3", "")));

  const currentTrackIndex = trackIds.indexOf(firstTrackId);
  const previousTrackId = trackIds[currentTrackIndex - 1];
  const nextTrackId = trackIds[currentTrackIndex + 1];
  const previousAndNextTracksIds: string[] = [];
  if (previousTrackId) previousAndNextTracksIds.push(previousTrackId);
  if (nextTrackId) previousAndNextTracksIds.push(nextTrackId);

  return await loadMultipleTracks(previousAndNextTracksIds, "background");
};

// Preload function for just the current track
export const preloadCurrentTrack = async () => {
  console.log("Attempting to preload current background track...");

  const location = getCurrentLocation();
  const currentChapter = location.currentChapter;
  const currentParagraph = location.currentParagraph;

  console.log(`Preloading track for current location: Chapter ${currentChapter}, Paragraph ${currentParagraph}`);

  const bookSongs = getValidatedBookSongs();
  if (!bookSongs) {
    return false;
  }

  // Find the applicable section for the current location
  const foundBackgroundSections = findApplicableBackgroundSections(bookSongs, currentChapter, currentParagraph);
  const currentSection = foundBackgroundSections[0];

  if (!currentSection || !currentSection.files || currentSection.files.length === 0) {
    console.log("No background track section found for current location.");
    return false;
  }

  // Get the first track of the current section
  const firstTrackId = currentSection.files[0].replace(".mp3", "");
  console.log(`Preloading current track: ${firstTrackId}`);

  return await loadSingleTrackJustDownload(firstTrackId, "current");
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
    if (!bookSongs || bookSongs.length === 0) {
      console.log(`No song definitions found for book ${getBookSlug()}. Cannot determine background song.`);
      isProcessingBackgroundSongs = false; // Reset flag before early exit
      return;
    }

    const foundBackgroundSections = findApplicableBackgroundSections(bookSongs, currentChapter, currentParagraph);
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
