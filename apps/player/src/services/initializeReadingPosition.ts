import { getLatestPosition, getCurrentPlatformAndBook } from "./readingPositionApi";
import { getSavedLocation, setSavedLocation, type ExtendedLocation } from "@player/helpers/paragraphsNavigation";

const normalizeTimestamp = (ts: unknown): number => {
  if (typeof ts === "number" && Number.isFinite(ts)) return ts;
  if (typeof ts === "string") {
    // Try ISO parse first
    const iso = Date.parse(ts);
    if (Number.isFinite(iso)) return iso;
    // Try numeric string
    const num = Number(ts);
    if (Number.isFinite(num)) return num;
  }
  return 0;
};

/**
 * Initialize reading position by reconciling local vs remote
 * Returns the most recent position based on timestamps
 */
export const initializeReadingPosition = async (): Promise<ExtendedLocation | null> => {
  try {
    const { platformId, bookSlug } = getCurrentPlatformAndBook();

    // Fetch remote position
    const remotePosition = await getLatestPosition(platformId, bookSlug);

    if (!remotePosition) {
      return getSavedLocation();
    }

    // Both exist - compare timestamps
    const remoteTimestamp = normalizeTimestamp(remotePosition.createdAt);
    const localTimestamp = normalizeTimestamp(getSavedLocation().timestamp);

    if (remoteTimestamp > localTimestamp) {
      // Remote is more recent
      const extended: ExtendedLocation = {
        chapter: remotePosition.chapter,
        paragraph: remotePosition.paragraph,
        endChapter: remotePosition.chapter,
        endParagraph: remotePosition.paragraph,
        currentChapter: remotePosition.chapter,
        currentParagraph: remotePosition.paragraph,
        earliestVisibleParagraph: remotePosition.paragraph,
        latestVisibleParagraph: remotePosition.paragraph,
        earliestVisibleChapter: remotePosition.chapter,
        latestVisibleChapter: remotePosition.chapter,
        timestamp: remoteTimestamp,
        progress: remotePosition.progress,
      };

      // Update localStorage and emit event
      setSavedLocation(extended, remotePosition.progress);

      return extended;
    } else {
      // Local is more recent or equal
      return getSavedLocation();
    }
  } catch (error) {
    console.warn("Failed to initialize reading position from remote:", error);
    // Fall back to local position
    return getSavedLocation();
  }
};
