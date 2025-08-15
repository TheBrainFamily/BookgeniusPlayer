import { getCurrentLocation } from "@/helpers/paragraphsNavigation";
import { bookDataLoader } from "@/services/bookDataLoader";
import { getBackgroundsForBook } from "@/genericBookDataGetters/getBackgroundsForBook";
import { getFileType, getSourceForFile, loadVideoAsHTMLElement } from "@/ui/background";

export const preloadBackgrounds = async () => {
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

  console.log("Preloading backgrounds for chapters:", chaptersToConsider);

  const bookBackgrounds = getBackgroundsForBook();
  if (!bookBackgrounds) {
    console.log(`No backgrounds definitions found for book ${bookDataLoader.getCurrentBook()}. Cannot preload.`);
    return false;
  }

  const sectionsToPreload = bookBackgrounds.filter((section) => chaptersToConsider.includes(section.chapter));

  if (sectionsToPreload.length === 0) {
    console.log("No backgrounds found for the current chapter range to preload.");
    return false;
  }

  console.log(`Preloading ${sectionsToPreload.length} sections...`);

  console.log("PINGWING: 42 sectionsToPreload", sectionsToPreload);

  const loadBackground = (fileName: string) => {
    console.log("PINGWING: 44 loadBackground, performance.now()", fileName, performance.now());
    const backgroundType = getFileType(fileName); // "video" | "image"
    const newSrc = getSourceForFile(fileName);

    if (backgroundType === "video") {
      const temporaryElement = document.createElement("video");
      loadVideoAsHTMLElement(temporaryElement, newSrc);
    } else if (backgroundType === "image") {
      const temporaryElement = document.createElement("div");
      temporaryElement.style.backgroundImage = `url('${newSrc}')`;
    } else if (backgroundType === "unknown") {
      console.error("Unknown file type:", fileName);
      return;
    }
    console.log("PINGWING: 58 loadBackground, performance.now()", fileName, performance.now());
  };

  sectionsToPreload.flatMap((section) => loadBackground(section.file));
  //
  // // Wait for all tracks to load in parallel
  // try {
  //   const results = await Promise.allSettled(preloadPromises);
  //   const successful = results.filter((result) => result.status === "fulfilled" && result.value === true).length;
  //   const failed = results.length - successful;
  //
  //   console.log(`Dynamic background tracks preloading complete. Successfully loaded: ${successful}, Failed: ${failed}`);
  //
  //   if (failed > 0) {
  //     const failedResults = results.filter((result) => result.status === "rejected" || (result.status === "fulfilled" && result.value === false));
  //     console.warn("Some tracks failed to preload:", failedResults);
  //   }
  //
  //   return successful > 0;
  // } catch (error) {
  //   console.error("Error during track preloading:", error);
  //   return false;
  // }
};
