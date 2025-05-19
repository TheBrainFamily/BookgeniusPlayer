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
import { wrapWord } from "./wrapWord";

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

    console.log("91: foundAudiobookSections BANG!", foundAudiobookSections);

    const sectionToApply = foundAudiobookSections[0];
    // TODO: PINGWING: Why we filter the whole book if need only first index

    console.log("94: sectionToApply.words BANG!", sectionToApply.words);

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
                      console.log("143: nextElement BANG!", nextElement);
                      console.log("143: sectionToApply BANG!", nextSection["words"]);
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
          const bookTracks = getAudiobookTracksForBook(CURRENT_BOOK);
          const sectionsToApply = bookTracks.filter(
            (section: AudiobookTracksSection) => section.chapter === currentChapter || (section.chapter === currentChapter + 1 && section.paragraph <= 1),
          );
          if (!sectionsToApply) {
            console.log(`No song definitions found for book ${CURRENT_BOOK}. Cannot determine Audiobook song.`);
            isProcessingAudiobookTracks = false; // Reset flag before early exit
            return;
          }
          return sectionsToApply
            .filter((section) => section.chapter === currentChapter)
            .flatMap((section: AudiobookTracksSection) => {
              return section.words.map((wp) => {
                return {
                  timestamp: wp[1],
                  callback: (previousWordIndex: number) => {
                    // console.log("179: previousWordIndex BANG!", previousWordIndex);
                    const sectionChapter = section.chapter;
                    const elementSelector = `section[data-chapter='${sectionChapter}'] [data-index='${section.paragraph}']`;
                    const element = document.querySelector(elementSelector);
                    if (element) {
                      const allWordsInParagraph = element.textContent?.split(" ");
                      const { foundWordIndex } = wrapWord(wp[0], allWordsInParagraph);
                      //replace all words with index lower than foundWordIndex with '@'
                      // const newText = allWordsInParagraph?.map((w, i) => (i < foundWordIndex ? '@' : w)).join(' ');
                      const newText = allWordsInParagraph?.map((w, i) => (i < foundWordIndex ? "@" : w));
                      // console.log(`wordIndex: ${foundWordIndex}`);

                      if (foundWordIndex !== -1) {
                        const wordElement = document.createElement("span");
                        wordElement.textContent = wp[0];
                        wordElement.setAttribute("data-nth-word", `${foundWordIndex}`);
                        wordElement.classList.add("current-word");

                        const gowno = newText.map((word, index) => (word === "@" ? allWordsInParagraph[index] : word));
                        // newText.splice(0, numberOfAts);

                        // const text = element.textContent;
                        // const replacedText = gowno.replace(wp[0], wordElement.outerHTML);
                        const replacedText = gowno.map((item, index) => (index === foundWordIndex ? wordElement.outerHTML : item)).join(" ");
                        element.innerHTML = replacedText;
                        return foundWordIndex;
                      }
                    }
                    console.log(`now playing section`, wp[0]);
                    return previousWordIndex; // Return previous word index if no new index was found
                  },
                  triggered: false,
                };
              });
            });
        };
        const wordLevelEvents: AudiobookTrackEvent[] = createWordLevelEvents();
        console.log(`wordLevelEvents: ${wordLevelEvents.splice(0, 3)}`);

        playTrack(sectionToApply.file, 0, sectionToApply["clip-begin"], [...events, ...wordLevelEvents]);
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
