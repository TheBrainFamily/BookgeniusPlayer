// import {
//   transitionToTrack,
//   loadTrack,
//   initAudioContext, // Keep if used elsewhere, but dealWithAudiobookTracks relies on crossfader's init
//   getCurrentTrackId,
//   stopAllPlayback,
//   setActiveSection,
//   isCurrentTrackInSection,
//   getCurrentSectionTracks,
// } from "./audio-crossfader"; // Adjust path as needed
import { CURRENT_BOOK } from "./consts"; // Adjust path as needed
import { getCurrentLocation } from "@/helpers/paragraphsNavigation";
import { getAudiobookTracksForBook, AudiobookTracksSection } from "@/getAudiobookTracksForBook"; // Adjust path as needed
import { loadTrack, playTrack, stopAllTracks } from "./audiobook-player";

let isProcessingAudiobookTracks = false; // Module-level flag to prevent re-entrancy

// Preload function - can be async if loadTrack is async (it is now)
// export const preloadAudiobookTracks = async () => {
//   console.log("Attempting to preload Audiobook tracks dynamically...");
//
//   const location = getCurrentLocation();
//   const currentChapter = location ? location.chapter : 0;
//   const chaptersToPreloadAhead = 2;
//
//   let chaptersToConsider: number[];
//   if (currentChapter > 0) {
//     chaptersToConsider = Array.from({ length: chaptersToPreloadAhead + 1 }, (_, i) => currentChapter + i);
//   } else {
//     console.log("No specific current chapter for preloading, preloading initial chapters.");
//     chaptersToConsider = [1, 2, 3]; // e.g. Chapters 1, 2, 3
//   }
//   console.log("Preloading tracks for chapters:", chaptersToConsider);
//
//   const bookTracks = getAudiobookTracksForBook(CURRENT_BOOK);
//   if (!bookTracks) {
//     console.log(`No song definitions found for book ${CURRENT_BOOK}. Cannot preload.`);
//     return;
//   }
//
//   const sectionsToPreload = bookTracks.filter((section) => chaptersToConsider.includes(section.chapter));
//
//   if (sectionsToPreload.length === 0) {
//     console.log("No Audiobook tracks found for the current chapter range to preload.");
//     return;
//   }
//
//   console.log(`Preloading ${sectionsToPreload.length} sections...`);
//   for (const section of sectionsToPreload) {
//     for (const file of section.files) {
//       const trackId = file.replace(".mp3", "");
//       // loadTrack is now async, so await it
//       await loadTrack(trackId /*, section.transitionPoints */);
//     }
//   }
//   console.log("Dynamic Audiobook tracks preloading complete.");
// };

interface DealWithAudiobookTracksParams {
  startChapter: number;
  startParagraph: number;
  endChapter: number;
  endParagraph: number;
}

export const dealWithAudiobookTracks = async ({ startChapter, startParagraph, endChapter, endParagraph }: DealWithAudiobookTracksParams): Promise<void> => {
  if (isProcessingAudiobookTracks) {
    console.log("dealWithAudiobookTracks: Already processing, skipping this call.");
    return;
  }
  isProcessingAudiobookTracks = true;

  console.log("dealWithAudiobookTracks invoked with:", { startChapter, startParagraph, endChapter, endParagraph });

  try {
    let chapterToConsider: number;
    let paragraphToConsider: number;

    if (startChapter === endChapter) {
      chapterToConsider = startChapter;
      paragraphToConsider = Math.floor((startParagraph + endParagraph) / 2);
    } else {
      chapterToConsider = endChapter; // Prioritize new chapter
      paragraphToConsider = 1; // Consider start of the new chapter
    }
    console.log(`Calculated consideration point: Chapter ${chapterToConsider}, Paragraph ${paragraphToConsider}`);

    const bookTracks = getAudiobookTracksForBook(CURRENT_BOOK);
    if (!bookTracks) {
      console.log(`No song definitions found for book ${CURRENT_BOOK}. Cannot determine Audiobook song.`);
      isProcessingAudiobookTracks = false; // Reset flag before early exit
      return;
    }

    const foundAudiobookSections = bookTracks
      .filter((section: AudiobookTracksSection) => {
        return section.chapter < chapterToConsider || (section.chapter === chapterToConsider && section.paragraph <= paragraphToConsider);
      })
      .sort((a: AudiobookTracksSection, b: AudiobookTracksSection) => {
        if (b.chapter !== a.chapter) return b.chapter - a.chapter;
        return b.paragraph - a.paragraph;
      });

    console.log(`foundAudiobookSections: ${JSON.stringify(foundAudiobookSections)}`);
    const sectionToApply = foundAudiobookSections[0];

    if (sectionToApply && sectionToApply.file) {
      console.log("Applicable Audiobook section found:", sectionToApply);
      const currentPlayingTrackId = `${sectionToApply.file}#${sectionToApply.smile_id}`;

      console.log(`Audiobook song check: Section is [${sectionToApply}]. Currently playing: ${currentPlayingTrackId}.`);

      console.log("PINGWING: 112 sectionToApply.file, 0, sectionToApply[clip-begin]", sectionToApply.file, 0, sectionToApply["clip-begin"]);
      loadTrack(sectionToApply.file).then(() => {
        console.log("audio loaded", sectionToApply.file);
        stopAllTracks();
        playTrack(sectionToApply.file, 0, sectionToApply["clip-begin"]);

        document
          .querySelector(`section[data-chapter='${sectionToApply.chapter}'] [data-index='${sectionToApply.paragraph}']`)
          .scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  } catch (error) {
    console.error("Error during dealWithAudiobookTracks execution:", error);
    // Potentially stop all music on unhandled error to prevent broken states
    // stopAllPlayback();
  } finally {
    isProcessingAudiobookTracks = false;
  }
};

// Helper to get active section tracks for the logic in dealWithAudiobookTracks
// function getActiveSectionTracks(): string[] | null {
//   // const currentSection = getCurrentSectionTracks(); // From audio-crossfader
//   return currentSection;
// }
