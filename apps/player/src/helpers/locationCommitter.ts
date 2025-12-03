/**
 * LocationCommitter - Candidate → Commit gate for "furthest" (resume) position
 *
 * This module prevents transient/glitchy positions from being saved as the
 * "furthest" position during layout churn (orientation changes, iOS wake,
 * virtualizer remounts, etc).
 *
 * Key idea:
 * - Candidate location: Updated immediately for UI (noisy, can bounce around)
 * - Committed furthest: Only advances after stability criteria are met
 *
 * Enable debug logging: localStorage.setItem('debug_scroll', 'true')
 */

import { scrollCoordinator } from "@player/services/ScrollCoordinator";
import type { Location } from "@player/state/LocationContext";

// Timing constants
const SCROLL_IDLE_MS = 150;
const COMMIT_CHECK_INTERVAL_MS = 200;

// Dwell time constants (how long a candidate must be stable before committing)
const DWELL_MS_FAST = 450; // First location or small moves (<=10 paragraphs)
const DWELL_MS_MEDIUM = 800; // Medium jumps (11-50 paragraphs)
const DWELL_MS_SLOW = 1500; // Large jumps (chapter change or >50 paragraphs)

// Distance thresholds
const SMALL_JUMP_PARAGRAPHS = 10;
const LARGE_JUMP_PARAGRAPHS = 50;

// Layout instability durations (exported for use in other modules)
export const LAYOUT_UNSTABLE_RESIZE_MS = 1200;
export const LAYOUT_UNSTABLE_VIRTUALIZER_MS = 400;

interface CommitterState {
  unstableUntil: number;
  candidate: Location | null;
  candidateSince: number;
  lastCommitted: Location | null;
  timer: number | null;
}

const state: CommitterState = { unstableUntil: 0, candidate: null, candidateSince: 0, lastCommitted: null, timer: null };

function debugLog(...args: unknown[]): void {
  if (typeof localStorage !== "undefined" && localStorage.getItem("debug_scroll") === "true") {
    console.log("[LocationCommitter]", new Date().toISOString().slice(11, 23), ...args);
  }
}

/**
 * Mark layout as unstable for a period (blocks commits).
 * Call this when starting resize/orientation transactions, on visibility change, etc.
 */
export function markLayoutUnstable(reason: string, ms: number = 800): void {
  state.unstableUntil = Math.max(state.unstableUntil, Date.now() + ms);
  debugLog("markLayoutUnstable", reason, ms);
}

/**
 * Compute required stable dwell time based on jump distance.
 * Bigger jumps require longer stability to commit.
 */
function requiredStableMs(candidate: Location, committed: Location | null): number {
  if (!committed) return DWELL_MS_FAST; // First location, be quick

  const chapterDiff = Math.abs(candidate.currentChapter - committed.currentChapter);
  const paragraphDiff = Math.abs(candidate.currentParagraph - committed.currentParagraph);

  // Same chapter, small move
  if (chapterDiff === 0 && paragraphDiff <= SMALL_JUMP_PARAGRAPHS) return DWELL_MS_FAST;

  // Large jump (chapter change or many paragraphs)
  if (chapterDiff > 0 || paragraphDiff > LARGE_JUMP_PARAGRAPHS) return DWELL_MS_SLOW;

  // Medium jump
  return DWELL_MS_MEDIUM;
}

function canCommit(): boolean {
  const now = Date.now();

  // Check navigating flag (Layer 1 mutex)
  if (scrollCoordinator.isNavigating) {
    debugLog("canCommit: false (isNavigating)");
    return false;
  }

  // Check layout stability window
  if (now < state.unstableUntil) {
    debugLog("canCommit: false (unstable window)", state.unstableUntil - now, "ms remaining");
    return false;
  }

  // Check candidate exists
  if (!state.candidate) {
    debugLog("canCommit: false (no candidate)");
    return false;
  }

  // Check dwell time
  const dwellTime = now - state.candidateSince;
  const requiredDwell = requiredStableMs(state.candidate, state.lastCommitted);
  if (dwellTime < requiredDwell) {
    debugLog("canCommit: false (dwell)", dwellTime, "<", requiredDwell);
    return false;
  }

  // Check scroll idle (optional but improves quality)
  const lastScrollAt = scrollCoordinator.getLastScrollEventAt?.() ?? 0;
  if (lastScrollAt > 0 && now - lastScrollAt < SCROLL_IDLE_MS) {
    debugLog("canCommit: false (scroll active)", now - lastScrollAt, "ms ago");
    return false;
  }

  debugLog("canCommit: true");
  return true;
}

function commitFurthest(loc: Location): void {
  // Only advance if ahead (monotonic "furthest" semantics)
  if (state.lastCommitted) {
    const isAhead =
      loc.currentChapter > state.lastCommitted.currentChapter ||
      (loc.currentChapter === state.lastCommitted.currentChapter && loc.currentParagraph > state.lastCommitted.currentParagraph);
    if (!isAhead) {
      debugLog("commitFurthest: skipped (not ahead)", loc.currentChapter, loc.currentParagraph);
      return;
    }
  }

  state.lastCommitted = loc;
  debugLog("commitFurthest", loc.currentChapter, loc.currentParagraph);

  // Persist to localStorage
  import("./paragraphsNavigation").then(({ setSavedLocation }) => {
    setSavedLocation(loc);
  });

  // Sync to server
  import("@player/services/readingPositionTracker").then(({ readingPositionTracker }) => {
    readingPositionTracker.onLocationChange(loc);
  });
}

function scheduleCommitCheck(): void {
  if (state.timer) return;

  state.timer = window.setTimeout(() => {
    state.timer = null;

    if (canCommit() && state.candidate) {
      commitFurthest(state.candidate);
    } else if (state.candidate) {
      // Retry later if we still have a candidate
      scheduleCommitCheck();
    }
  }, COMMIT_CHECK_INTERVAL_MS);
}

/**
 * Offer a candidate location. Will be committed after stability criteria are met.
 * Call this from setCurrentLocation instead of directly calling setSavedLocation.
 */
export function offerCandidateLocation(loc: Location, meta?: { source?: "observer" | "system" | "user" }): void {
  const now = Date.now();

  // Check if candidate changed
  const changed = !state.candidate || loc.currentChapter !== state.candidate.currentChapter || loc.currentParagraph !== state.candidate.currentParagraph;

  if (changed) {
    state.candidate = loc;
    state.candidateSince = now;
    debugLog("candidate changed", loc.currentChapter, loc.currentParagraph, meta?.source);
  }

  scheduleCommitCheck();
}

/**
 * Best-effort flush on pagehide - only commits if already stable.
 * Won't save garbage if still in unstable window.
 */
export function flushCommit(): void {
  if (canCommit() && state.candidate) {
    commitFurthest(state.candidate);
  } else {
    debugLog("flushCommit: skipped (not stable)");
  }
}

/**
 * Initialize with current saved location.
 * Call this on app load after loading saved location from localStorage.
 */
export function initCommitter(savedLocation: Location | null): void {
  state.lastCommitted = savedLocation;
  debugLog("initCommitter", savedLocation?.currentChapter, savedLocation?.currentParagraph);
}

// Expose to window for debugging in console
if (typeof window !== "undefined") {
  // @ts-expect-error Exposing for debug purposes
  window.locationCommitter = { getState: () => ({ ...state }), markLayoutUnstable, flushCommit };
}
