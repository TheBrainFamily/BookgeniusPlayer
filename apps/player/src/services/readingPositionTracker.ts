import { type Location } from "@player/state/LocationContext";
import {
  savePosition,
  getCurrentPlatformAndBook,
  type SavePositionInput,
} from "./readingPositionApi";
import { getSavedLocation, setSavedLocation } from "@player/helpers/paragraphsNavigation";
import { calculateReadProgress } from "@player/helpers/readProgress";
import { bookIndex } from "@player/logic/BookIndex";

const APP_VERSION = import.meta.env.VITE_BUILD_TIME || "unknown";
const SOURCE = `player-web-${APP_VERSION}`;

class ReadingPositionTracker {
  private lastSentPosition: { chapter: number; paragraph: number } | null = null;
  private throttleTimer: number | null = null;
  private pendingPosition: Location | null = null;
  private remoteSyncEnabled = true;
  private readonly THROTTLE_MS = 10000; // 10 seconds

  /**
   * Called when location changes (from setCurrentLocation)
   * Only tracks forward movements
   */
  onLocationChange(loc: Location): void {
    if (!this.remoteSyncEnabled) return;

    // Skip if paragraph hasn't changed
    if (
      this.lastSentPosition?.chapter === loc.currentChapter &&
      this.lastSentPosition?.paragraph === loc.currentParagraph
    ) {
      return;
    }

    // Only send if moving forward relative to furthest saved
    const saved = getSavedLocation();
    if (saved) {
      const isBackward =
        loc.currentChapter < saved.currentChapter ||
        (loc.currentChapter === saved.currentChapter &&
          loc.currentParagraph < saved.currentParagraph);
      if (isBackward) {
        return;
      }
    }

    // Check if this is a chapter change (significant movement)
    const isChapterChange =
      this.lastSentPosition && this.lastSentPosition.chapter !== loc.currentChapter;

    if (isChapterChange) {
      // Send immediately on chapter change
      this.sendPosition(loc, true);
    } else {
      // Otherwise, throttle
      this.schedulePosition(loc);
    }
  }

  /**
   * Schedule a position save with throttling
   */
  private schedulePosition(loc: Location): void {
    this.pendingPosition = loc;

    if (this.throttleTimer !== null) {
      return; // Already scheduled
    }

    this.throttleTimer = window.setTimeout(() => {
      this.throttleTimer = null;
      if (this.pendingPosition) {
        this.sendPosition(this.pendingPosition, false);
        this.pendingPosition = null;
      }
    }, this.THROTTLE_MS);
  }

  /**
   * Send position to backend
   */
  private async sendPosition(loc: Location, _immediate: boolean): Promise<void> {
    try {
      const { platformId, bookSlug } = getCurrentPlatformAndBook();
      const progress = this.calculateProgress(loc.currentChapter, loc.currentParagraph);

      const input: SavePositionInput = {
        platformId,
        bookSlug,
        chapter: loc.currentChapter,
        paragraph: loc.currentParagraph,
        progress,
        source: SOURCE,
      };

      // Send to backend
      await savePosition(input);

      // Update last sent position
      this.lastSentPosition = { chapter: loc.currentChapter, paragraph: loc.currentParagraph };

      // Update localStorage with progress
      setSavedLocation(loc, progress);
    } catch (error) {
      const err = error as Error;
      if (err.message === "Unauthorized") {
        console.warn("Remote sync disabled due to auth failure");
        this.remoteSyncEnabled = false;
      } else {
        // Silently swallow network errors
        console.debug("Failed to save reading position:", err.message);
      }
    }
  }

  /**
   * Calculate progress as 0..1
   */
  private calculateProgress(chapter: number, paragraph: number): number | null {
    try {
      bookIndex.ensureInitialized();
      const structure = bookIndex.getChaptersStructure();
      const total = structure.reduce((sum, entry) => sum + entry.paragraphCount, 0);

      if (total === 0 || structure.length === 0) {
        return null;
      }

      const progressPercent = calculateReadProgress(structure, chapter, paragraph, total);
      return progressPercent / 100; // Convert to 0..1
    } catch {
      return null;
    }
  }

  /**
   * Flush any pending position (for unload handlers)
   * Bypasses throttle
   */
  flush(): void {
    if (this.throttleTimer !== null) {
      clearTimeout(this.throttleTimer);
      this.throttleTimer = null;
    }

    if (this.pendingPosition) {
      this.flushSync(this.pendingPosition);
      this.pendingPosition = null;
    }
  }

  /**
   * Synchronous flush using sendBeacon or keepalive fetch
   */
  private flushSync(loc: Location): void {
    try {
      const { platformId, bookSlug } = getCurrentPlatformAndBook();
      const progress = this.calculateProgress(loc.currentChapter, loc.currentParagraph);

      const input: SavePositionInput = {
        platformId,
        bookSlug,
        chapter: loc.currentChapter,
        paragraph: loc.currentParagraph,
        progress,
        source: SOURCE,
      };

      const payload = JSON.stringify(input);

      // Try sendBeacon first (preferred for unload)
      if (typeof navigator.sendBeacon === "function") {
        const blob = new Blob([payload], { type: "application/json" });
        const success = navigator.sendBeacon("/api/reading-position", blob);
        if (success) {
          setSavedLocation(loc, progress);
          return;
        }
      }

      // Fallback to keepalive fetch
      fetch("/api/reading-position", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
        credentials: "include",
      }).catch(() => {
        // Ignore errors during unload
      });

      setSavedLocation(loc, progress);
    } catch (error) {
      console.debug("Failed to flush position:", error);
    }
  }
}

// Singleton instance
export const readingPositionTracker = new ReadingPositionTracker();
