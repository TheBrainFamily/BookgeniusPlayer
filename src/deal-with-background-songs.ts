import {
  transitionToTrack,
  loadTrack,
  initAudioContext,
  getCurrentTrackId,
  stopAllPlayback,
  setActiveSection, // Import new function
  isCurrentTrackInSection, // Import new helper
} from "./audio-crossfader";
import { CURRENT_BOOK } from "./consts";
import { BOOK_SLUGS } from "./consts";

const getChapterForTom = (tom: number, chapter: number) => {
  if (tom === 2) {
    return chapter + 25;
  }
  return chapter;
};

// Updated structure
let backgroundSongsDefined = [
  { chapter: 4, paragraph: 3, files: ["track1.mp3", "track2.mp3"] /* transitionPoints: [...] // Optional per-track? ignore for now */ },
  { chapter: getChapterForTom(2, 2), paragraph: 1, files: ["tom-2-chapter-2-part-1-b.mp3", "tom-2-chapter-2-part-1.mp3"] },
  { chapter: getChapterForTom(2, 2), paragraph: 60, files: ["tom-2-chapter-2-part-2-b.mp3", "tom-2-chapter-2-part-2.mp3"] },
  { chapter: getChapterForTom(2, 3), paragraph: 1, files: ["tom-2-chapter-3-part-1-b.mp3", "tom-2-chapter-3-part-1.mp3"] },
  { chapter: getChapterForTom(2, 3), paragraph: 64, files: ["tom-2-chapter-3-part-2-b.mp3", "tom-2-chapter-3-part-2.mp3"] },
  // Add more sections as needed
];

if (CURRENT_BOOK === BOOK_SLUGS._1984) {
  backgroundSongsDefined = [
    { chapter: 1, paragraph: 1, files: ["chapter_1_part_1.mp3", "chapter_1_part_1b.mp3"] },
    { chapter: 1, paragraph: 24, files: ["chapter_1_part_2.mp3", "chapter_1_part_2b.mp3"] },
  ];
}

export const preloadBackgroundTracks = async () => {
  console.log("Preloading background tracks...");
  if (!initAudioContext()) {
    console.warn("Cannot preload tracks, AudioContext not ready.");
    return;
  } else {
    initAudioContext(); // Call this only once from a user gesture
  }
  for (const section of backgroundSongsDefined) {
    for (const file of section.files) {
      const trackId = file.replace(".mp3", "");
      // TODO: How to handle transition points if they differ per track in a section?
      // For now, loading without specific points. They could be added later or associated differently.
      await loadTrack(trackId /*, section.transitionPoints */); // Pass points if available/needed
    }
  }
  console.log("Background tracks preloading complete.");
};

export const dealWithBackgroundSongs = ({ startChapter, startParagraph }) => {
  console.log("dealWithBackgroundSongs", { startChapter, startParagraph });
  // Ensure AudioContext is ready (should have been initialized by user gesture)
  // if (!audioContext) { /* Check state */ return; }

  const foundBackgroundSections = backgroundSongsDefined
    .filter((section) => {
      // Find the section that STARTS at or before the current position
      return section.chapter < startChapter || (section.chapter === startChapter && section.paragraph <= startParagraph);

      // --- OR --- Find section that ENCOMPASSES the current range (more complex if ranges overlap)
      // This depends on exact definition: Does the song start when entering the range, or must the entire range be inside?
      // Using the "starts at or before" logic for simplicity now.
    })
    .sort((a, b) => {
      // Sort descending to easily pick the latest applicable start point
      if (b.chapter !== a.chapter) {
        return b.chapter - a.chapter;
      }
      return b.paragraph - a.paragraph;
    });

  // The most relevant section is the one starting latest but still before or at the current position
  const sectionToApply = foundBackgroundSections[0]; // Highest chapter/paragraph that's <= current position

  if (sectionToApply && sectionToApply.files && sectionToApply.files.length > 0) {
    console.log("Applicable background section:", sectionToApply);
    const sectionTrackIds = sectionToApply.files.map((f) => f.replace(".mp3", ""));
    const firstTrackIdInSection = sectionTrackIds[0];
    const currentTrack = getCurrentTrackId();

    // Inform the crossfader about the active section's tracks
    // This function should compare with its internal state and only update if different
    setActiveSection(sectionTrackIds);

    console.log(
      `Background song check: Section found starting Ch ${sectionToApply.chapter}, Par ${sectionToApply.paragraph}. First track: ${firstTrackIdInSection}. Currently playing: ${currentTrack}`,
    );

    // Check if the currently playing track is already part of the *correct* section
    if (isCurrentTrackInSection(sectionTrackIds)) {
      console.log(`Current track ${currentTrack} is already part of the active section [${sectionTrackIds.join(", ")}]. Letting sequence handler manage playback.`);
      // Do nothing - the onended handler in audio-crossfader will play the next track if needed
      return;
    }

    // If we're here, either nothing is playing, or the wrong track/section is playing.
    // Transition to the *first* track of the *correct* section.
    console.log(`Transitioning to the first track of the section: ${firstTrackIdInSection}`);

    // Ensure the first track is loaded before transitioning
    loadTrack(firstTrackIdInSection /*, sectionToApply.transitionPoints */).then((loaded) => {
      if (loaded) {
        const success = transitionToTrack(firstTrackIdInSection);
        if (!success) {
          console.warn(`Failed to initiate transition/start for ${firstTrackIdInSection}.`);
          // Handle potential failure (e.g., maybe state was weird)
        } else {
          console.log(`Successfully initiated transition/start for ${firstTrackIdInSection}`);
        }
      } else {
        console.error(`Failed to load first track ${firstTrackIdInSection} of section. Cannot transition.`);
        // Handle loading failure - maybe stop music?
        stopAllPlayback();
      }
    });
  } else {
    // No background music defined for this location
    console.log(`No background song section defined for Chapter ${startChapter}, Paragraph ${startParagraph}.`);
    // const currentTrack = getCurrentTrackId();
    // if (currentTrack) {
    //   console.log("Stopping current playback.");
    //   setActiveSection(null); // Clear active section in crossfader
    //   stopAllPlayback();
    // } else {
    //   // Ensure section is marked as inactive even if nothing was playing
    //   setActiveSection(null);
    // }
  }
};
