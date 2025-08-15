import { getCurrentLocation } from "@/helpers/paragraphsNavigation";
import { bookDataLoader } from "@/services/bookDataLoader";
import { getBackgroundsForBook } from "@/genericBookDataGetters/getBackgroundsForBook";
import { getFileType, getSourceForFile, loadVideoAsHTMLElement } from "@/ui/backgroundUtils";

// Cache to store preloaded elements
const preloadCache = new Map<string, HTMLVideoElement | HTMLDivElement>();
const pendingLoads = new Map<string, Promise<boolean>>();

const MAX_CACHE_SIZE = 20; // Adjust based on typical asset sizes

const evictOldestFromCache = () => {
  if (preloadCache.size < MAX_CACHE_SIZE) return;

  // Remove the first (oldest) entry
  const firstKey = preloadCache.keys().next().value;
  if (firstKey) {
    const element = preloadCache.get(firstKey);
    // Clean up video elements to free resources
    if (element instanceof HTMLVideoElement) {
      element.src = "";
      element.load();
    }
    if (element instanceof HTMLDivElement) {
      element.style.backgroundImage = "none";
    }
    preloadCache.delete(firstKey);
  }
};

// Export function to get preloaded element if available
export const getPreloadedElement = (fileName: string): HTMLVideoElement | HTMLDivElement | null => {
  return preloadCache.get(fileName) || null;
};

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
    // Skip if already cached
    if (preloadCache.has(fileName)) {
      console.log("Background already cached:", fileName);
      return Promise.resolve(true);
    }

    // Return pending promise if a download is already in progress
    if (pendingLoads.has(fileName)) {
      return pendingLoads.get(fileName)!;
    }

    const loadPromise = new Promise<boolean>((resolve) => {
      const backgroundType = getFileType(fileName);
      const newSrc = getSourceForFile(fileName);

      if (backgroundType === "video") {
        const videoElement = document.createElement("video");
        videoElement.preload = "auto";
        videoElement.muted = true; // Required for autoplay policies

        const onCanPlay = () => {
          evictOldestFromCache(); // ← evict before adding new
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
          videoElement.removeEventListener("canplay", onCanPlay);
          videoElement.removeEventListener("error", onError);
        };

        videoElement.addEventListener("canplay", onCanPlay);
        videoElement.addEventListener("error", onError);

        loadVideoAsHTMLElement(videoElement, newSrc);
      } else if (backgroundType === "image") {
        const img = new Image();

        img.onload = () => {
          const divElement = document.createElement("div");
          divElement.style.backgroundImage = `url('${newSrc}')`;
          evictOldestFromCache(); // ← evict before adding new
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

    pendingLoads.set(fileName, loadPromise);
    loadPromise.finally(() => {
      pendingLoads.delete(fileName);
    });

    return loadPromise;
  };

  // Wait for all backgrounds to load in parallel
  try {
    const preloadPromises = sectionsToPreload.map((section) => loadBackground(section.file));
    const results = await Promise.allSettled(preloadPromises);
    const successful = results.filter((result) => result.status === "fulfilled" && result.value === true).length;
    const failed = results.length - successful;

    console.log(`Backgrounds preloading complete. Successfully loaded: ${successful}, Failed: ${failed}`);

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
