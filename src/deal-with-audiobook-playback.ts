import { CURRENT_BOOK } from "./consts"; // Adjust path as needed
import { getAudiobookTracksForBook, AudiobookTracksSection } from "@/getAudiobookTracksForBook"; // Adjust path as needed
import { loadTrack, playTrack, stopAllTracks, AudiobookTrackEvent } from "./audiobook-player";
import { highlightNthOccurrence } from "./highlightWord";

const AUDIO_SYNC_SHIFT = -0.1;

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

    const bookTracks = await getAudiobookTracksForBook();
    if (!bookTracks) {
      console.log(`No song definitions found for book ${CURRENT_BOOK}. Cannot determine Audiobook song.`);
      isProcessingAudiobookTracks = false;
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
    // TODO: PINGWING: Why we filter the whole book if need only first index

    if (sectionToApply && sectionToApply.file) {
      console.log("Audiobook song check: Applicable Audiobook section found:", sectionToApply);
      const currentPlayingTrackId = `${sectionToApply.file}#${sectionToApply.smile_id}`;

      console.log(`Audiobook song check: Currently playing:`, currentPlayingTrackId);

      loadTrack(sectionToApply.file).then(() => {
        console.log("audio loaded", sectionToApply.file);
        stopAllTracks();

        const createEventsForAudiobook = () => {
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
                  const nextSection = sectionsToApply[index + 1];
                  const nextSectionChapter = nextSection.chapter;
                  const nextElementSelector = `section[data-chapter='${nextSectionChapter}'] [data-index='${nextSection.paragraph}']`;
                  const nextElement = document.querySelector(nextElementSelector);

                  // console.log("PINGWING: 112 nextElementSelector", nextElementSelector);
                  if (currentChapter === nextSectionChapter) {
                    isProcessingAudiobookTracks = true;
                    setTimeout(() => {
                      isProcessingAudiobookTracks = false;
                    }, 1000);
                  }

                  if (nextElement) {
                    if (currentParagraph !== nextSection.paragraph) {
                      console.log("PONTONO DIFFERENT PARAGRAPH   found", nextElement);
                      nextElement.scrollIntoView({ behavior: "smooth", block: "start" });
                    } else {
                      console.log("PONTONO SAME PARAGRAPH found", nextElement);
                      // nextElement.scrollIntoView({ behavior: "smooth", block: "start" });
                    }
                  } else {
                    console.log("PONTONO nextElement not found", nextElementSelector);
                  }

                  // Return a number to match AudiobookTrackEvent callback signature
                  return 0;
                },
                triggered: false,
              };
            });
          return events;
        };
        const events: AudiobookTrackEvent[] = createEventsForAudiobook();

        const createWordLevelEvents = () => {
          const sectionsToApply = bookTracks.filter(
            (section: AudiobookTracksSection) => section.chapter === currentChapter || (section.chapter === currentChapter + 1 && section.paragraph <= 1),
          );
          if (!sectionsToApply) {
            console.log(`No song definitions found for book ${CURRENT_BOOK}. Cannot determine Audiobook song.`);
            isProcessingAudiobookTracks = false; // Reset flag before early exit
            return;
          }

          // Remove highlights from all paragraphs except current ones
          const removeHighlightsFromOtherParagraphs = () => {
            const allParagraphs = document.querySelectorAll("section[data-chapter] [data-index]");
            allParagraphs.forEach((paragraph) => {
              const section = paragraph.closest("section[data-chapter]");
              if (!section) return;

              const chapterNum = parseInt(section.getAttribute("data-chapter") || "0");
              const paragraphNum = parseInt(paragraph.getAttribute("data-index") || "0");

              // Skip current chapter and paragraph
              if (chapterNum === currentChapter && paragraphNum === currentParagraph) return;

              // Remove all current-word spans from this paragraph
              const currentWordSpans = paragraph.querySelectorAll(".current-word");
              currentWordSpans.forEach((span) => {
                const parent = span.parentNode;
                if (parent) {
                  while (span.firstChild) {
                    parent.insertBefore(span.firstChild, span);
                  }
                  parent.removeChild(span);
                  if (typeof parent.normalize === "function") {
                    parent.normalize();
                  }
                }
              });
            });
          };

          return sectionsToApply
            .filter((section) => section.chapter === currentChapter)
            .flatMap((section: AudiobookTracksSection) => {
              if (!section?.words) return;
              const wordOccurrenceCounterWithinSection = new Map<string, number>();
              const numWordsInSection = section.words.length;
              return section.words.map((wp, wordIndex) => {
                const wordStr = wp[0].replace(/[.,!?;:]/g, "");
                const timestamp = wp[1];
                const isLastWord = wordIndex === numWordsInSection - 1;

                const occurrenceIndex = wordOccurrenceCounterWithinSection.get(wordStr) || 0;
                wordOccurrenceCounterWithinSection.set(wordStr, occurrenceIndex + 1);

                return {
                  timestamp,
                  callback: () => {
                    removeHighlightsFromOtherParagraphs();

                    const paragraphSelector = `section[data-chapter='${section.chapter}'] [data-index='${section.paragraph}']`;
                    const paragraphElement = document.querySelector(paragraphSelector);

                    if (paragraphElement) {
                      paragraphElement.innerHTML = highlightNthOccurrence(paragraphElement.innerHTML, wordStr, occurrenceIndex, "current-word", isLastWord);
                    }
                  },
                  triggered: false,
                };
              });
            });
        };
        const wordLevelEvents: AudiobookTrackEvent[] = createWordLevelEvents();
        // console.log(`wordLevelEvents: ${wordLevelEvents.splice(0, 3)}`);

        const clipBeginCalculated = sectionToApply["clip-begin"] + AUDIO_SYNC_SHIFT;
        const clipBeginToUse = clipBeginCalculated > 0 ? clipBeginCalculated : 0; // THIS PREVENTS A LOUD AUDIBLE CLICK / AUDIO ARTIFACT

        playTrack(sectionToApply.file, 0, clipBeginToUse, [...events, ...wordLevelEvents]);
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
