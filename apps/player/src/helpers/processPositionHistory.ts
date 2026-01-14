import type { ReadingPosition } from "@player/services/readingPositionApi";
import { bookIndex } from "@player/logic/BookIndex";

const SESSION_GAP_MS = 30 * 60 * 1000; // 30 minutes

export interface ProcessedSession {
  sessionStart: ReadingPosition;
  sessionEnd: ReadingPosition;
  significantJumps: ReadingPosition[];
}

/**
 * Process raw position history into grouped sessions with significant jumps
 */
export const processPositionHistory = (history: ReadingPosition[]): ProcessedSession[] => {
  if (history.length === 0) return [];

  // Sort by timestamp descending (newest first)
  const sorted = [...history].sort((a, b) => b.createdAt - a.createdAt);

  const sessions: ProcessedSession[] = [];
  let currentSession: ReadingPosition[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const position = sorted[i];
    const prevPosition = sorted[i - 1];

    if (i === 0) {
      // First position starts a new session
      currentSession = [position];
      continue;
    }

    // Check if this is a new session (gap >= 30 minutes)
    const gap = prevPosition.createdAt - position.createdAt;
    if (gap >= SESSION_GAP_MS) {
      // Close current session and add to results
      if (currentSession.length > 0) {
        sessions.push(processSession(currentSession));
      }
      // Start new session
      currentSession = [position];
    } else {
      // Continue current session
      currentSession.push(position);
    }
  }

  // Add the last session
  if (currentSession.length > 0) {
    sessions.push(processSession(currentSession));
  }

  return sessions;
};

/**
 * Process a single session to extract first, last, and significant jumps
 */
const processSession = (positions: ReadingPosition[]): ProcessedSession => {
  if (positions.length === 0) {
    throw new Error("Empty session");
  }

  // Positions are already sorted newest-first within the session
  const sessionStart = positions[positions.length - 1]; // Oldest in session
  const sessionEnd = positions[0]; // Newest in session

  // Find significant jumps
  const significantJumps = findSignificantJumps(positions);

  return { sessionStart, sessionEnd, significantJumps };
};

/**
 * Detect significant jumps in a session
 * A jump is significant if:
 * 1. Chapter changes, OR
 * 2. With >= 5 prior steps, jump is >= 10x mean step size, OR
 * 3. Absolute jump >= 300 paragraphs (fallback)
 */
const findSignificantJumps = (positions: ReadingPosition[]): ReadingPosition[] => {
  if (positions.length < 2) return [];

  const jumps: ReadingPosition[] = [];
  const stepSizes: number[] = [];

  // Reverse to process chronologically (oldest to newest)
  const chronological = [...positions].reverse();

  for (let i = 1; i < chronological.length; i++) {
    const prev = chronological[i - 1];
    const curr = chronological[i];

    // Check for chapter change
    const chapterChanged = curr.chapter !== prev.chapter;

    // Calculate paragraph step (accounting for chapter changes)
    const paragraphStep = calculateParagraphStep(prev, curr);
    const absStep = Math.abs(paragraphStep);

    // Track step sizes for mean calculation
    stepSizes.push(absStep);

    let isSignificant = false;

    if (chapterChanged) {
      isSignificant = true;
    }

    // Mean-based trigger (guard against zero/NaN and always exclude current step from mean)
    if (!isSignificant && stepSizes.length >= 5) {
      const prior = stepSizes.slice(0, -1);
      const mean = prior.length > 0 ? prior.reduce((sum, s) => sum + s, 0) / prior.length : 0;
      if (mean > 0 && absStep >= mean * 10) {
        isSignificant = true;
      }
    }

    // Fallback absolute threshold — always evaluate regardless of history length
    if (!isSignificant && absStep >= 300) {
      isSignificant = true;
    }

    if (isSignificant) {
      jumps.push(curr);
    }
  }

  return jumps;
};

/**
 * Calculate paragraph step between two positions
 * Simplified: just use paragraph numbers (doesn't account for total book structure)
 */
const calculateParagraphStep = (prev: ReadingPosition, curr: ReadingPosition): number => {
  try {
    bookIndex.ensureInitialized();
    const structure = bookIndex.getChaptersStructure();

    let prevTotal = 0;
    for (const chapter of structure) {
      if (chapter.chapterNumber < prev.chapter) {
        prevTotal += chapter.paragraphCount;
      } else if (chapter.chapterNumber === prev.chapter) {
        prevTotal += Math.min(prev.paragraph + 1, chapter.paragraphCount);
        break;
      }
    }

    let currTotal = 0;
    for (const chapter of structure) {
      if (chapter.chapterNumber < curr.chapter) {
        currTotal += chapter.paragraphCount;
      } else if (chapter.chapterNumber === curr.chapter) {
        currTotal += Math.min(curr.paragraph + 1, chapter.paragraphCount);
        break;
      }
    }

    return currTotal - prevTotal;
  } catch {
    // Fallback to simple approximation if structure unavailable
    if (curr.chapter !== prev.chapter) {
      return (curr.chapter - prev.chapter) * 1000 + curr.paragraph - prev.paragraph;
    }
    return curr.paragraph - prev.paragraph;
  }
};

/**
 * Format timestamp for display
 */
export const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (dateOnly.getTime() === today.getTime()) {
    return `Today ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } else if (dateOnly.getTime() === yesterday.getTime()) {
    return `Yesterday ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } else {
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
};
