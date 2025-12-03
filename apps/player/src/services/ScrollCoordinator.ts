/**
 * ScrollCoordinator - Centralized scroll state management
 *
 * Manages scroll state (direction, position, navigation locks) to coordinate
 * between the virtualizer and navigation systems, reducing race conditions.
 *
 * Enable debug logging: localStorage.setItem('debug_scroll', 'true')
 */

const DEBUG_KEY = "debug_scroll";

export const debugLog = (...args: unknown[]): void => {
  if (typeof localStorage !== "undefined" && localStorage.getItem(DEBUG_KEY) === "true") {
    console.log("[ScrollDebug]", new Date().toISOString().slice(11, 23), ...args);
  }
};

type ScrollDirection = "up" | "down" | "none";

class ScrollCoordinator {
  private static instance: ScrollCoordinator;

  private _scrollDirection: ScrollDirection = "none";
  private _lastScrollTop = 0;
  private _isNavigating = false;
  private _suppressTracking = false;
  private _lastChapterTransitionTime = 0;
  private _chapterTransitionCooldownMs = 0; // Configurable, default 0
  private _lastScrollEventAt = 0;
  private _container: HTMLElement | null = null;
  private _scrollHandler: (() => void) | null = null;

  static getInstance(): ScrollCoordinator {
    if (!ScrollCoordinator.instance) {
      ScrollCoordinator.instance = new ScrollCoordinator();
    }
    return ScrollCoordinator.instance;
  }

  initialize(container: HTMLElement): void {
    // Avoid re-initializing if already set to the same container
    if (this._container === container) {
      debugLog("initialize skipped - same container");
      return;
    }

    // Clean up previous listeners if switching containers
    this.destroy();

    this._container = container;
    this._lastScrollTop = container.scrollTop;

    this._scrollHandler = () => {
      // Skip tracking during DOM mutations to avoid inconsistent direction state
      if (this._suppressTracking) {
        return;
      }
      this._lastScrollEventAt = Date.now();
      const newScrollTop = container.scrollTop;
      this._scrollDirection = newScrollTop > this._lastScrollTop ? "down" : newScrollTop < this._lastScrollTop ? "up" : "none";
      this._lastScrollTop = newScrollTop;
      // Note: Logging every scroll event is very verbose, only log when direction changes
    };

    container.addEventListener("scroll", this._scrollHandler, { passive: true });
    debugLog("initialized", { scrollTop: this._lastScrollTop });
  }

  destroy(): void {
    if (this._container && this._scrollHandler) {
      this._container.removeEventListener("scroll", this._scrollHandler);
      debugLog("destroyed");
    }
    this._container = null;
    this._scrollHandler = null;
    this._scrollDirection = "none";
    this._lastScrollTop = 0;
  }

  get scrollDirection(): ScrollDirection {
    return this._scrollDirection;
  }

  get isNavigating(): boolean {
    return this._isNavigating;
  }

  get container(): HTMLElement | null {
    return this._container;
  }

  /**
   * Get the timestamp of the last scroll event.
   * Used by locationCommitter to check scroll idle state before committing.
   */
  getLastScrollEventAt(): number {
    return this._lastScrollEventAt;
  }

  setNavigating(value: boolean): void {
    this._isNavigating = value;
    debugLog("setNavigating", value);
  }

  /**
   * Suppress scroll direction tracking during DOM mutations.
   * Use when batch-removing chapters to avoid inconsistent direction state.
   */
  setSuppressTracking(value: boolean): void {
    this._suppressTracking = value;
    debugLog("setSuppressTracking", value);
  }

  recordChapterTransition(): void {
    this._lastChapterTransitionTime = Date.now();
    debugLog("chapterTransition recorded");
  }

  canTriggerChapterTransition(): boolean {
    const elapsed = Date.now() - this._lastChapterTransitionTime;
    const canTrigger = elapsed >= this._chapterTransitionCooldownMs;
    debugLog("canTriggerChapterTransition", { elapsed, cooldown: this._chapterTransitionCooldownMs, canTrigger });
    return canTrigger;
  }

  setCooldownMs(ms: number): void {
    this._chapterTransitionCooldownMs = ms;
    debugLog("setCooldownMs", ms);
  }

  getCooldownMs(): number {
    return this._chapterTransitionCooldownMs;
  }

  /**
   * Wait for layout to stabilize using multiple requestAnimationFrame calls.
   * This ensures that pending layout recalculations have completed, especially
   * when mounting many chapters for long-distance smooth scrolls.
   */
  async waitForLayoutStability(minFrames: number = 3): Promise<void> {
    // Wait for multiple frames to ensure layout is complete
    for (let i = 0; i < minFrames; i++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    // Additional small delay for expensive layouts
    await new Promise<void>((resolve) => setTimeout(resolve, 16));
    debugLog("layoutStability achieved", { frames: minFrames });
  }

  /**
   * Force a synchronous reflow by reading a layout property.
   * Use before measurements that need accurate values after DOM mutations.
   */
  forceReflow(element: HTMLElement): void {
    // Reading offsetHeight forces the browser to complete any pending layout calculations
    void element.offsetHeight;
    debugLog("forceReflow");
  }

  /**
   * Update the last known scroll position without triggering direction change.
   * Useful after programmatic scroll operations.
   */
  syncScrollPosition(): void {
    if (this._container) {
      this._lastScrollTop = this._container.scrollTop;
      debugLog("syncScrollPosition", { scrollTop: this._lastScrollTop });
    }
  }

  /**
   * Reset scroll direction to prevent stale "down" from triggering spacer transitions.
   * Call after resize/orientation compensation completes.
   *
   * During orientation changes, the browser may fire scroll events that set direction
   * to "down" even though the user didn't scroll. This could trigger the spacer
   * observer's chapter transition logic unexpectedly.
   */
  resetDirection(): void {
    this._scrollDirection = "none";
    this.syncScrollPosition();
    debugLog("resetDirection");
  }
}

export const scrollCoordinator = ScrollCoordinator.getInstance();

// Expose to window for debugging in console
if (typeof window !== "undefined") {
  // @ts-expect-error Exposing for debug purposes
  window.scrollCoordinator = scrollCoordinator;
}
