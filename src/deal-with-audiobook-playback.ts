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
import { getAudiobookTracksForBook, AudiobookTracksSection } from "@/getAudiobookTracksForBook"; // Adjust path as needed
import { loadTrack, playTrack, stopAllTracks, AudiobookTrackEvent } from "./audiobook-player";

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
  currentChapter: number;
  currentParagraph: number;
}

export const dealWithAudiobookTracks = async ({ currentChapter, currentParagraph }: DealWithAudiobookTracksParams): Promise<void> => {
  if (isProcessingAudiobookTracks) {
    console.log("dealWithAudiobookTracks: Already processing, skipping this call.");
    return;
  }
  isProcessingAudiobookTracks = true;

  console.log("dealWithAudiobookTracks invoked with:", { currentChapter, currentParagraph });

  try {
    console.log(`Calculated consideration point: Chapter ${currentChapter}, Paragraph ${currentParagraph}`);

    const bookTracks = getAudiobookTracksForBook(CURRENT_BOOK);
    if (!bookTracks) {
      console.log(`No song definitions found for book ${CURRENT_BOOK}. Cannot determine Audiobook song.`);
      isProcessingAudiobookTracks = false; // Reset flag before early exit
      return;
    }

    const foundAudiobookSections = bookTracks
      .filter((section: AudiobookTracksSection) => {
        return section.chapter === currentChapter - 1 || (section.chapter === currentChapter && section.paragraph <= currentParagraph);
      })
      .sort((a: AudiobookTracksSection, b: AudiobookTracksSection) => {
        if (b.chapter !== a.chapter) return b.chapter - a.chapter;
        return b.paragraph - a.paragraph;
      });

    const sectionToApply = foundAudiobookSections[0];

    if (sectionToApply && sectionToApply.file) {
      console.log("Applicable Audiobook section found:", sectionToApply);
      const currentPlayingTrackId = `${sectionToApply.file}#${sectionToApply.smile_id}`;

      console.log(`Audiobook song check: Section is [${sectionToApply}]. Currently playing: ${currentPlayingTrackId}.`);

      // console.log("WILCZYNSKA: 112 sectionToApply.file, 0, sectionToApply[clip-begin]", sectionToApply.file, 0, sectionToApply["clip-begin"]);
      loadTrack(sectionToApply.file).then(() => {
        console.log("audio loaded", sectionToApply.file);
        stopAllTracks();

        const createEventsForAudiobook = () => {
          const bookTracks = getAudiobookTracksForBook(CURRENT_BOOK);
          const sectionsToApply = bookTracks.filter(
            (section: AudiobookTracksSection) => section.chapter === currentChapter || (section.chapter === currentChapter + 1 && section.paragraph <= 1),
          );
          if (!sectionsToApply) {
            console.log(`No song definitions found for book ${CURRENT_BOOK}. Cannot determine Audiobook song.`);
            isProcessingAudiobookTracks = false; // Reset flag before early exit
            return;
          }

          const events: AudiobookTrackEvent[] = sectionsToApply
            .filter((section) => section.chapter === currentChapter)
            .map((section: AudiobookTracksSection, index: number) => {
              return {
                timestamp: section["clip-end"],
                callback: () => {
                  // console.log("PINGWING: 112 sectionToApply.file, 0, sectionToApply[clip-begin]", section.file, 0, section["clip-begin"]);
                  const currentChapter = sectionsToApply[index].chapter;
                  const nextSectionChapter = sectionsToApply[index + 1].chapter;
                  const nextElementSelector = `section[data-chapter='${nextSectionChapter}'] [data-index='${sectionsToApply[index + 1].paragraph}']`;
                  const nextElement = document.querySelector(nextElementSelector);

                  // console.log("PINGWING: 112 nextElementSelector", nextElementSelector);
                  if (currentChapter === nextSectionChapter) {
                    isProcessingAudiobookTracks = true;
                    setTimeout(() => {
                      isProcessingAudiobookTracks = false;
                    }, 1000);
                  }

                  if (nextElement) {
                    if (currentParagraph !== sectionsToApply[index + 1].paragraph) {
                      console.log("PONTONO DIFFERENT PARAGRAPH   found", nextElement);
                      nextElement.scrollIntoView({ behavior: "smooth", block: "start" });
                    } else {
                      console.log("PONTONO SAME PARAGRAPH found", nextElement);
                      // nextElement.scrollIntoView({ behavior: "smooth", block: "start" });
                    }
                  } else {
                    console.log("PONTONO nextElement not found", nextElementSelector);
                  }
                },
                triggered: false,
              };
            });
          return events;
        };
        const events: AudiobookTrackEvent[] = createEventsForAudiobook();

        playTrack(sectionToApply.file, 0, sectionToApply["clip-begin"], events);

        const scrollToSelectorAgain = `section[data-chapter='${sectionToApply.chapter}'] [data-index='${sectionToApply.paragraph}']`;

        // console.log("WILCZYNSKA: 164 scrollToSelector", scrollToSelectorAgain);
        // document.querySelector(scrollToSelectorAgain).scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  } catch (error) {
    console.error("Error during dealWithAudiobookTracks execution:", error);
    // Potentially stop all music on unhandled error to prevent broken states
    // stopAllPlayback();
  } finally {
    setTimeout(() => {
      isProcessingAudiobookTracks = false;
    }, 1000);
  }
};

// Helper to get active section tracks for the logic in dealWithAudiobookTracks
// function getActiveSectionTracks(): string[] | null {
//   // const currentSection = getCurrentSectionTracks(); // From audio-crossfader
//   return currentSection;
// }
