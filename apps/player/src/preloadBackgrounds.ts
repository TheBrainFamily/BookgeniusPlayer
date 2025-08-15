import { getCurrentLocation } from "@/helpers/paragraphsNavigation";
import { bookDataLoader } from "@/services/bookDataLoader";
import { getBackgroundsForBook } from "@/genericBookDataGetters/getBackgroundsForBook";
import { getFileType, getSourceForFile, loadVideoAsHTMLElement } from "@/ui/background";

// Cache to store preloaded elements
const preloadCache = new Map<string, HTMLVideoElement | HTMLDivElement>();

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

  const loadBackground = (fileName: string): Promise<boolean> => {
    return new Promise((resolve) => {
      console.log("PINGWING: loadBackground starting", fileName, performance.now());

      // Skip if already cached
      if (preloadCache.has(fileName)) {
        console.log("Background already cached:", fileName);
        resolve(true);
        return;
      }

      const backgroundType = getFileType(fileName);
      const newSrc = getSourceForFile(fileName);

      if (backgroundType === "video") {
        const videoElement = document.createElement("video");
        videoElement.preload = "auto";
        videoElement.muted = true; // Required for autoplay policies

        const onLoadedData = () => {
          console.log("PINGWING: video loaded", fileName, performance.now());
          preloadCache.set(fileName, videoElement);
          cleanup();
          resolve(true);
        };

        const onError = () => {
          console.error("Failed to load video:", fileName);
          cleanup();
          resolve(false);
        };

        const cleanup = () => {
          videoElement.removeEventListener("loadeddata", onLoadedData);
          videoElement.removeEventListener("error", onError);
        };

        videoElement.addEventListener("loadeddata", onLoadedData);
        videoElement.addEventListener("error", onError);

        loadVideoAsHTMLElement(videoElement, newSrc);
      } else if (backgroundType === "image") {
        const img = new Image();

        img.onload = () => {
          console.log("PINGWING: image loaded", fileName, performance.now());
          const divElement = document.createElement("div");
          divElement.style.backgroundImage = `url('${newSrc}')`;
          preloadCache.set(fileName, divElement);
          resolve(true);
        };

        img.onerror = () => {
          console.error("Failed to load image:", fileName);
          resolve(false);
        };

        img.src = newSrc;
      } else {
        console.error("Unknown file type:", fileName);
        resolve(false);
      }
    });
  };

  // Wait for all backgrounds to load in parallel
  try {
    const preloadPromises = sectionsToPreload.map((section) => loadBackground(section.file));
    const results = await Promise.allSettled(preloadPromises);
    const successful = results.filter((result) => result.status === "fulfilled" && result.value === true).length;
    const failed = results.length - successful;

    console.log(`Background preloading complete. Successfully loaded: ${successful}, Failed: ${failed}`);

    if (failed > 0) {
      const failedResults = results.filter((result) => result.status === "rejected" || (result.status === "fulfilled" && result.value === false));
      console.warn("Some backgrounds failed to preload:", failedResults);
    }

    return successful > 0;
  } catch (error) {
    console.error("Error during background preloading:", error);
    return false;
  }
};
