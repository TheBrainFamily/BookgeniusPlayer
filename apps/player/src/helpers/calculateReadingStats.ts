import type { ReadingPosition } from "@player/services/readingPositionApi";
import { bookIndex } from "@player/logic/BookIndex";

export interface ReadingStats {
  averageParagraphsPerMinute: number;
  estimatedMinutesRemaining: number | null;
  totalReadingTimeMinutes: number;
  readingSpeed: "slow" | "medium" | "fast" | "unknown";
}

/**
 * Calculate reading statistics based on position history
 */
export const calculateReadingStats = (
  history: ReadingPosition[],
  currentProgress: number | null,
  // eslint-disable-next-line complexity -- reading stats calculation with multiple conditions
): ReadingStats => {
  if (history.length < 2) {
    return {
      averageParagraphsPerMinute: 0,
      estimatedMinutesRemaining: null,
      totalReadingTimeMinutes: 0,
      readingSpeed: "unknown",
    };
  }

  // Sort by timestamp ascending (oldest first)
  const sorted = [...history].sort((a, b) => a.createdAt - b.createdAt);

  // Calculate paragraphs per minute from position changes
  const progressDeltas: { paragraphs: number; minutes: number }[] = [];
  let activeTimeMinutes = 0; // Sum of active reading durations (filtered intervals)

  // Determine total paragraphs from the book structure (for accurate normalization)
  let totalParagraphs = 0;
  try {
    bookIndex.ensureInitialized();
    const structure = bookIndex.getChaptersStructure();
    totalParagraphs = structure.reduce((sum, entry) => sum + entry.paragraphCount, 0);
  } catch {
    totalParagraphs = 0;
  }

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];

    const timeDiffMs = curr.createdAt - prev.createdAt;
    const timeDiffMinutes = timeDiffMs / (1000 * 60);

    // Skip if time difference is too small (< 1 minute) or too large (> 2 hours = session boundary)
    if (timeDiffMinutes < 1 || timeDiffMinutes > 120) {
      continue;
    }
    // Count active time regardless of progress delta
    activeTimeMinutes += timeDiffMinutes;

    // Use progress difference if available, otherwise estimate from chapter/paragraph
    let progressDelta = 0;
    if (curr.progress !== null && prev.progress !== null) {
      progressDelta = curr.progress - prev.progress;
    } else {
      // Fallback: estimate progress from chapter/paragraph change using real total paragraphs when available
      const paragraphDelta = calculateParagraphDelta(prev, curr);
      progressDelta = totalParagraphs > 0 ? paragraphDelta / totalParagraphs : 0;
    }

    // Only count forward progress
    if (progressDelta > 0 && progressDelta < 1) {
      // Reasonable progress delta
      const effectiveTotal = totalParagraphs > 0 ? totalParagraphs : 10000; // last-resort fallback
      progressDeltas.push({ paragraphs: progressDelta * effectiveTotal, minutes: timeDiffMinutes });
    }
  }

  if (progressDeltas.length === 0) {
    return {
      averageParagraphsPerMinute: 0,
      estimatedMinutesRemaining: null,
      totalReadingTimeMinutes: 0,
      readingSpeed: "unknown",
    };
  }

  // Calculate average paragraphs per minute
  // Weight recent sessions more heavily (last 5 deltas get 2x weight)
  let totalWeightedParagraphs = 0;
  let totalWeightedMinutes = 0;

  progressDeltas.forEach((delta, idx) => {
    const weight = idx >= progressDeltas.length - 5 ? 2 : 1; // Recent sessions weighted 2x
    totalWeightedParagraphs += delta.paragraphs * weight;
    totalWeightedMinutes += delta.minutes * weight;
  });

  const averageParagraphsPerMinute =
    totalWeightedMinutes > 0 ? totalWeightedParagraphs / totalWeightedMinutes : 0;

  // Total reading time is the sum of active intervals (not wall-clock span)
  const totalReadingTimeMinutes = activeTimeMinutes;

  // Estimate remaining time
  let estimatedMinutesRemaining: number | null = null;
  if (
    currentProgress !== null &&
    currentProgress > 0 &&
    currentProgress < 1 &&
    averageParagraphsPerMinute > 0
  ) {
    const remainingProgress = 1 - currentProgress;
    const effectiveTotal = totalParagraphs > 0 ? totalParagraphs : 10000;
    const remainingParagraphs = remainingProgress * effectiveTotal;
    estimatedMinutesRemaining = remainingParagraphs / averageParagraphsPerMinute;
  }

  // Categorize reading speed
  let readingSpeed: "slow" | "medium" | "fast" | "unknown" = "unknown";
  if (averageParagraphsPerMinute > 0) {
    if (averageParagraphsPerMinute < 10) {
      readingSpeed = "slow";
    } else if (averageParagraphsPerMinute < 30) {
      readingSpeed = "medium";
    } else {
      readingSpeed = "fast";
    }
  }

  return {
    averageParagraphsPerMinute,
    estimatedMinutesRemaining,
    totalReadingTimeMinutes,
    readingSpeed,
  };
};

/**
 * Calculate paragraph delta between two positions
 */
const calculateParagraphDelta = (prev: ReadingPosition, curr: ReadingPosition): number => {
  try {
    bookIndex.ensureInitialized();
    const structure = bookIndex.getChaptersStructure();

    let prevTotal = 0;
    let currTotal = 0;

    for (const chapter of structure) {
      if (chapter.chapterNumber < prev.chapter) {
        prevTotal += chapter.paragraphCount;
      } else if (chapter.chapterNumber === prev.chapter) {
        prevTotal += Math.min(prev.paragraph + 1, chapter.paragraphCount);
        break;
      }
    }

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
    // Fallback: simple paragraph difference
    return curr.paragraph - prev.paragraph + (curr.chapter - prev.chapter) * 100;
  }
};

/**
 * Format time in minutes to human-readable string
 */
export const formatReadingTime = (minutes: number | null): string => {
  if (minutes === null || minutes === 0) return "N/A";

  if (minutes < 1) {
    return "< 1 min";
  }

  const total = Math.round(minutes);
  if (total < 60) {
    return `${total} min`;
  }

  const hours = Math.floor(total / 60);
  const mins = total % 60; // guaranteed 0..59
  if (hours < 2) {
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
};
