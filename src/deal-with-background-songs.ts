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
  { chapter: 1, paragraph: 1, files: ["chapter_1_paragraph_1.mp3", "chapter_1_paragraph_1b.mp3"] },
  { chapter: 1, paragraph: 46, files: ["chapter_1_paragraph_46.mp3", "chapter_1_paragraph_46b.mp3"] },
  { chapter: 1, paragraph: 90, files: ["chapter_1_paragraph_90.mp3", "chapter_1_paragraph_90b.mp3"] },
  { chapter: 2, paragraph: 1, files: ["chapter_2_paragraph_1.mp3", "chapter_2_paragraph_1b.mp3"] },
  { chapter: 2, paragraph: 19, files: ["chapter_2_paragraph_19.mp3", "chapter_2_paragraph_19b.mp3"] },
  { chapter: 3, paragraph: 1, files: ["chapter_3_paragraph_1.mp3", "chapter_3_paragraph_1b.mp3"] },
  { chapter: 3, paragraph: 27, files: ["chapter_3_paragraph_27.mp3", "chapter_3_paragraph_27b.mp3"] },
  { chapter: 4, paragraph: 1, files: ["chapter_4_paragraph_1.mp3", "chapter_4_paragraph_1b.mp3"] },
  { chapter: 4, paragraph: 36, files: ["chapter_4_paragraph_36.mp3", "chapter_4_paragraph_36b.mp3"] },
  { chapter: 4, paragraph: 55, files: ["chapter_4_paragraph_55.mp3", "chapter_4_paragraph_55b.mp3"] },
  { chapter: 5, paragraph: 1, files: ["chapter_5_paragraph_1.mp3", "chapter_5_paragraph_1b.mp3"] },
  { chapter: 5, paragraph: 26, files: ["chapter_5_paragraph_26.mp3", "chapter_5_paragraph_26b.mp3"] },
  { chapter: 5, paragraph: 75, files: ["chapter_5_paragraph_75.mp3", "chapter_5_paragraph_75b.mp3"] },
  { chapter: 6, paragraph: 1, files: ["chapter_6_paragraph_1.mp3", "chapter_6_paragraph_1b.mp3"] },
  { chapter: 6, paragraph: 20, files: ["chapter_6_paragraph_20.mp3", "chapter_6_paragraph_20b.mp3"] },
  { chapter: 6, paragraph: 56, files: ["chapter_6_paragraph_56.mp3", "chapter_6_paragraph_56b.mp3"] },
  { chapter: 7, paragraph: 1, files: ["chapter_7_paragraph_1.mp3", "chapter_7_paragraph_1b.mp3"] },
  { chapter: 7, paragraph: 53, files: ["chapter_7_paragraph_53.mp3", "chapter_7_paragraph_53b.mp3"] },
  { chapter: 8, paragraph: 1, files: ["chapter_8_paragraph_1.mp3", "chapter_8_paragraph_1b.mp3"] },
  { chapter: 8, paragraph: 26, files: ["chapter_8_paragraph_26.mp3", "chapter_8_paragraph_26b.mp3"] },
  { chapter: 9, paragraph: 1, files: ["chapter_9_paragraph_1.mp3", "chapter_9_paragraph_1b.mp3"] },
  { chapter: 9, paragraph: 36, files: ["chapter_9_paragraph_36.mp3", "chapter_9_paragraph_36b.mp3"] },
  { chapter: 10, paragraph: 1, files: ["chapter_10_paragraph_1.mp3", "chapter_10_paragraph_1b.mp3"] },
  { chapter: 10, paragraph: 29, files: ["chapter_10_paragraph_29.mp3", "chapter_10_paragraph_29b.mp3"] },
  { chapter: 10, paragraph: 55, files: ["chapter_10_paragraph_55.mp3", "chapter_10_paragraph_55b.mp3"] },
  { chapter: 11, paragraph: 1, files: ["chapter_11_paragraph_1.mp3", "chapter_11_paragraph_1b.mp3"] },
  { chapter: 11, paragraph: 61, files: ["chapter_11_paragraph_61.mp3", "chapter_11_paragraph_61b.mp3"] },
  { chapter: 12, paragraph: 1, files: ["chapter_12_paragraph_1.mp3", "chapter_12_paragraph_1b.mp3"] },
  { chapter: 12, paragraph: 26, files: ["chapter_12_paragraph_26.mp3", "chapter_12_paragraph_26b.mp3"] },
  { chapter: 12, paragraph: 78, files: ["chapter_12_paragraph_78.mp3", "chapter_12_paragraph_78b.mp3"] },
  { chapter: 13, paragraph: 1, files: ["chapter_13_paragraph_1.mp3", "chapter_13_paragraph_1b.mp3"] },
  { chapter: 13, paragraph: 32, files: ["chapter_13_paragraph_32.mp3", "chapter_13_paragraph_32b.mp3"] },
  { chapter: 14, paragraph: 1, files: ["chapter_14_paragraph_1.mp3", "chapter_14_paragraph_1b.mp3"] },
  { chapter: 14, paragraph: 51, files: ["chapter_14_paragraph_51.mp3", "chapter_14_paragraph_51b.mp3"] },
  { chapter: 15, paragraph: 1, files: ["chapter_15_paragraph_1.mp3", "chapter_15_paragraph_1b.mp3"] },
  { chapter: 15, paragraph: 28, files: ["chapter_15_paragraph_28.mp3", "chapter_15_paragraph_28b.mp3"] },
  { chapter: 16, paragraph: 36, files: ["chapter_16_paragraph_36.mp3", "chapter_16_paragraph_36b.mp3"] },
  { chapter: 17, paragraph: 1, files: ["chapter_17_paragraph_1.mp3", "chapter_17_paragraph_1b.mp3"] },
  { chapter: 17, paragraph: 41, files: ["chapter_17_paragraph_41.mp3", "chapter_17_paragraph_41b.mp3"] },
  { chapter: 17, paragraph: 69, files: ["chapter_17_paragraph_69.mp3", "chapter_17_paragraph_69b.mp3"] },
  { chapter: 18, paragraph: 1, files: ["chapter_18_paragraph_1.mp3", "chapter_18_paragraph_1b.mp3"] },
  { chapter: 18, paragraph: 81, files: ["chapter_18_paragraph_81.mp3", "chapter_18_paragraph_81b.mp3"] },
  { chapter: 19, paragraph: 1, files: ["chapter_19_paragraph_1.mp3", "chapter_19_paragraph_1b.mp3"] },
  { chapter: 19, paragraph: 22, files: ["chapter_19_paragraph_22.mp3", "chapter_19_paragraph_22b.mp3"] },
  { chapter: 19, paragraph: 51, files: ["chapter_19_paragraph_51.mp3", "chapter_19_paragraph_51b.mp3"] },
  { chapter: 20, paragraph: 1, files: ["chapter_20_paragraph_1.mp3", "chapter_20_paragraph_1b.mp3"] },
  { chapter: 20, paragraph: 58, files: ["chapter_20_paragraph_58.mp3", "chapter_20_paragraph_58b.mp3"] },
  { chapter: 21, paragraph: 1, files: ["chapter_21_paragraph_1.mp3", "chapter_21_paragraph_1b.mp3"] },
  { chapter: 21, paragraph: 46, files: ["chapter_21_paragraph_46.mp3", "chapter_21_paragraph_46b.mp3"] },
  { chapter: 21, paragraph: 67, files: ["chapter_21_paragraph_67.mp3", "chapter_21_paragraph_67b.mp3"] },
  { chapter: 22, paragraph: 1, files: ["chapter_22_paragraph_1.mp3", "chapter_22_paragraph_1b.mp3"] },
  { chapter: 22, paragraph: 35, files: ["chapter_22_paragraph_35.mp3", "chapter_22_paragraph_35b.mp3"] },
  { chapter: 23, paragraph: 1, files: ["chapter_23_paragraph_1.mp3", "chapter_23_paragraph_1b.mp3"] },
  { chapter: 23, paragraph: 45, files: ["chapter_23_paragraph_45.mp3", "chapter_23_paragraph_45b.mp3"] },
  { chapter: 24, paragraph: 1, files: ["chapter_24_paragraph_1.mp3", "chapter_24_paragraph_1b.mp3"] },
  { chapter: 24, paragraph: 36, files: ["chapter_24_paragraph_36.mp3", "chapter_24_paragraph_36b.mp3"] },
  { chapter: 24, paragraph: 127, files: ["chapter_24_paragraph_127.mp3", "chapter_24_paragraph_127b.mp3"] },
  { chapter: 25, paragraph: 1, files: ["chapter_25_paragraph_1.mp3", "chapter_25_paragraph_1b.mp3"] },
  { chapter: 25, paragraph: 80, files: ["chapter_25_paragraph_80.mp3", "chapter_25_paragraph_80b.mp3"] },
  // { chapter: 4, paragraph: 3, files: ["track1.mp3", "track2.mp3"] /* transitionPoints: [...] // Optional per-track? ignore for now */ },
  // { chapter: getChapterForTom(2, 2), paragraph: 1, files: ["tom-2-chapter-2-part-1-b.mp3", "tom-2-chapter-2-part-1.mp3"] },
  // { chapter: getChapterForTom(2, 2), paragraph: 60, files: ["tom-2-chapter-2-part-2-b.mp3", "tom-2-chapter-2-part-2.mp3"] },
  // { chapter: getChapterForTom(2, 3), paragraph: 1, files: ["tom-2-chapter-3-part-1-b.mp3", "tom-2-chapter-3-part-1.mp3"] },
  // { chapter: getChapterForTom(2, 3), paragraph: 64, files: ["tom-2-chapter-3-part-2-b.mp3", "tom-2-chapter-3-part-2.mp3"] },
  { chapter: 26, paragraph: 1, files: ["chapter_26_paragraph_1.mp3", "chapter_26_paragraph_1b.mp3"] },
  { chapter: 26, paragraph: 26, files: ["chapter_26_paragraph_26.mp3", "chapter_26_paragraph_26b.mp3"] },
  { chapter: 26, paragraph: 54, files: ["chapter_26_paragraph_54.mp3", "chapter_26_paragraph_54b.mp3"] },
  { chapter: 27, paragraph: 1, files: ["chapter_27_paragraph_1.mp3", "chapter_27_paragraph_1b.mp3"] },
  { chapter: 27, paragraph: 29, files: ["chapter_27_paragraph_29.mp3", "chapter_27_paragraph_29b.mp3"] },
  { chapter: 28, paragraph: 1, files: ["chapter_28_paragraph_1.mp3", "chapter_28_paragraph_1b.mp3"] },
  { chapter: 28, paragraph: 75, files: ["chapter_28_paragraph_75.mp3", "chapter_28_paragraph_75b.mp3"] },
  { chapter: 29, paragraph: 1, files: ["chapter_29_paragraph_1.mp3", "chapter_29_paragraph_1b.mp3"] },
  { chapter: 29, paragraph: 37, files: ["chapter_29_paragraph_37.mp3", "chapter_29_paragraph_37b.mp3"] },
  { chapter: 30, paragraph: 1, files: ["chapter_30_paragraph_1.mp3", "chapter_30_paragraph_1b.mp3"] },
  { chapter: 30, paragraph: 52, files: ["chapter_30_paragraph_52.mp3", "chapter_30_paragraph_52b.mp3"] },
  { chapter: 30, paragraph: 100, files: ["chapter_30_paragraph_100.mp3", "chapter_30_paragraph_100b.mp3"] },
  { chapter: 31, paragraph: 1, files: ["chapter_31_paragraph_1.mp3", "chapter_31_paragraph_1b.mp3"] },
  { chapter: 31, paragraph: 62, files: ["chapter_31_paragraph_62.mp3", "chapter_31_paragraph_62b.mp3"] },
  { chapter: 32, paragraph: 1, files: ["chapter_32_paragraph_1.mp3", "chapter_32_paragraph_1b.mp3"] },
  { chapter: 32, paragraph: 68, files: ["chapter_32_paragraph_68.mp3", "chapter_32_paragraph_68b.mp3"] },
  { chapter: 33, paragraph: 1, files: ["chapter_33_paragraph_1.mp3", "chapter_33_paragraph_1b.mp3"] },
  { chapter: 33, paragraph: 67, files: ["chapter_33_paragraph_67.mp3", "chapter_33_paragraph_67b.mp3"] },
  { chapter: 34, paragraph: 1, files: ["chapter_34_paragraph_1.mp3", "chapter_34_paragraph_1b.mp3"] },
  { chapter: 34, paragraph: 44, files: ["chapter_34_paragraph_44.mp3", "chapter_34_paragraph_44b.mp3"] },
  { chapter: 34, paragraph: 152, files: ["chapter_34_paragraph_152.mp3", "chapter_34_paragraph_152b.mp3"] },
  { chapter: 35, paragraph: 1, files: ["chapter_35_paragraph_1.mp3", "chapter_35_paragraph_1b.mp3"] },
  { chapter: 35, paragraph: 94, files: ["chapter_35_paragraph_94.mp3", "chapter_35_paragraph_94b.mp3"] },
  { chapter: 36, paragraph: 1, files: ["chapter_36_paragraph_1.mp3", "chapter_36_paragraph_1b.mp3"] },
  { chapter: 36, paragraph: 40, files: ["chapter_36_paragraph_40.mp3", "chapter_36_paragraph_40b.mp3"] },
  { chapter: 36, paragraph: 71, files: ["chapter_36_paragraph_71.mp3", "chapter_36_paragraph_71b.mp3"] },
  { chapter: 37, paragraph: 1, files: ["chapter_37_paragraph_1.mp3", "chapter_37_paragraph_1b.mp3"] },
  { chapter: 37, paragraph: 39, files: ["chapter_37_paragraph_39.mp3", "chapter_37_paragraph_39b.mp3"] },
  { chapter: 37, paragraph: 85, files: ["chapter_37_paragraph_85.mp3", "chapter_37_paragraph_85b.mp3"] },
  { chapter: 38, paragraph: 1, files: ["chapter_38_paragraph_1.mp3", "chapter_38_paragraph_1b.mp3"] },
  { chapter: 38, paragraph: 40, files: ["chapter_38_paragraph_40.mp3", "chapter_38_paragraph_40b.mp3"] },
  { chapter: 38, paragraph: 105, files: ["chapter_38_paragraph_105.mp3", "chapter_38_paragraph_105b.mp3"] },
  { chapter: 44, paragraph: 1, files: ["chapter_44_paragraph_1.mp3", "chapter_44_paragraph_1b.mp3"] },
  { chapter: 44, paragraph: 51, files: ["chapter_44_paragraph_51.mp3", "chapter_44_paragraph_51b.mp3"] },
  { chapter: 44, paragraph: 158, files: ["chapter_44_paragraph_158.mp3", "chapter_44_paragraph_158b.mp3"] },
  { chapter: 45, paragraph: 51, files: ["chapter_45_paragraph_51.mp3", "chapter_45_paragraph_51b.mp3"] },
  { chapter: 45, paragraph: 97, files: ["chapter_45_paragraph_97.mp3", "chapter_45_paragraph_97b.mp3"] },
  { chapter: 46, paragraph: 1, files: ["chapter_46_paragraph_1.mp3", "chapter_46_paragraph_1b.mp3"] },
  { chapter: 46, paragraph: 43, files: ["chapter_46_paragraph_43.mp3", "chapter_46_paragraph_43b.mp3"] },
  { chapter: 47, paragraph: 1, files: ["chapter_47_paragraph_1.mp3", "chapter_47_paragraph_1b.mp3"] },
  { chapter: 47, paragraph: 54, files: ["chapter_47_paragraph_54.mp3", "chapter_47_paragraph_54b.mp3"] },
  { chapter: 48, paragraph: 1, files: ["chapter_48_paragraph_1.mp3", "chapter_48_paragraph_1b.mp3"] },
  { chapter: 48, paragraph: 62, files: ["chapter_48_paragraph_62.mp3", "chapter_48_paragraph_62b.mp3"] },
  { chapter: 49, paragraph: 1, files: ["chapter_49_paragraph_1.mp3", "chapter_49_paragraph_1b.mp3"] },
  { chapter: 49, paragraph: 64, files: ["chapter_49_paragraph_64.mp3", "chapter_49_paragraph_64b.mp3"] },
  { chapter: 39, paragraph: 1, files: ["chapter_39_paragraph_1.mp3", "chapter_39_paragraph_1b.mp3"] },
  { chapter: 39, paragraph: 57, files: ["chapter_39_paragraph_57.mp3", "chapter_39_paragraph_57b.mp3"] },
  { chapter: 39, paragraph: 114, files: ["chapter_39_paragraph_114.mp3", "chapter_39_paragraph_114b.mp3"] },
  { chapter: 40, paragraph: 1, files: ["chapter_40_paragraph_1.mp3", "chapter_40_paragraph_1b.mp3"] },
  { chapter: 40, paragraph: 15, files: ["chapter_40_paragraph_15.mp3", "chapter_40_paragraph_15b.mp3"] },
  { chapter: 40, paragraph: 78, files: ["chapter_40_paragraph_78.mp3", "chapter_40_paragraph_78b.mp3"] },
  { chapter: 41, paragraph: 1, files: ["chapter_41_paragraph_1.mp3", "chapter_41_paragraph_1b.mp3"] },
  { chapter: 41, paragraph: 75, files: ["chapter_41_paragraph_75.mp3", "chapter_41_paragraph_75b.mp3"] },
  { chapter: 41, paragraph: 244, files: ["chapter_41_paragraph_244.mp3", "chapter_41_paragraph_244b.mp3"] },
  { chapter: 42, paragraph: 1, files: ["chapter_42_paragraph_1b.mp3", "chapter_42_paragraph_1.mp3"] },
  { chapter: 42, paragraph: 23, files: ["chapter_42_paragraph_23.mp3", "chapter_42_paragraph_23b.mp3"] },
  { chapter: 42, paragraph: 47, files: ["chapter_42_paragraph_47.mp3", "chapter_42_paragraph_47b.mp3"] },
  { chapter: 43, paragraph: 1, files: ["chapter_43_paragraph_1.mp3", "chapter_43_paragraph_1b.mp3"] },
  { chapter: 43, paragraph: 19, files: ["chapter_43_paragraph_19.mp3", "chapter_43_paragraph_19b.mp3"] },
  { chapter: 43, paragraph: 106, files: ["chapter_43_paragraph_106.mp3", "chapter_43_paragraph_106b.mp3"] },

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
