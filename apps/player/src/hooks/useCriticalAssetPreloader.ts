/**
 * useCriticalAssetPreloader - Preload background/music for reading position ASAP
 *
 * This hook runs as soon as background/music data arrives from Convex,
 * BEFORE waiting for chapter processing to complete (isReady).
 *
 * Uses dealWithBackground directly to avoid duplicating logic and ensure
 * no conflicts with useBackgroundVideo when it mounts later.
 */

import { useEffect, useRef, useState } from "react";
import { useBookConvex } from "@player/context/BookConvexContext";
import { dealWithBackground } from "@player/ui/background";
import { initializeReadingPosition } from "@player/services/initializeReadingPosition";
import { ExtendedLocation } from "@player/helpers/paragraphsNavigation";

export function useCriticalAssetPreloader() {
  const [readingPosition, setReadingPosition] = useState<ExtendedLocation | null>(null);
  const { backgroundsForBook, backgroundSongsForBook, isLoading, ensureCompiledChaptersLoaded } =
    useBookConvex();
  const preloadStartedRef = useRef(false);
  const chapterPreloadStartedRef = useRef(false);

  // Fetch reading position immediately on mount
  useEffect(() => {
    console.log("[CriticalAssetPreloader] Initializing reading position");
    initializeReadingPosition().then((pos) => {
      console.log("[CriticalAssetPreloader] Reading position:", pos);
      setReadingPosition(pos);
    });
  }, []);

  // Trigger initial chapter HTML/character fragments load once we know the reading position
  useEffect(() => {
    if (isLoading) return;
    if (!readingPosition) return;
    if (chapterPreloadStartedRef.current) return;

    chapterPreloadStartedRef.current = true;

    const startChapter = readingPosition.currentChapter ?? readingPosition.chapter ?? 1;
    const requested = [startChapter - 1, startChapter, startChapter + 1];
    void ensureCompiledChaptersLoaded(requested);
  }, [isLoading, readingPosition, ensureCompiledChaptersLoaded]);

  // Trigger background loading once we have position AND data
  useEffect(() => {
    // Don't run until queries have returned
    if (isLoading) return;

    // Wait for reading position to be determined
    if (!readingPosition) return;

    // Only run once
    if (preloadStartedRef.current) return;

    // Nothing to preload
    if (backgroundsForBook.length === 0 && backgroundSongsForBook.length === 0) return;

    preloadStartedRef.current = true;

    const { currentChapter, currentParagraph } = readingPosition;
    console.log("[CriticalAssetPreloader] Triggering dealWithBackground for:", {
      currentChapter,
      currentParagraph,
    });

    // Use the existing mechanism - it handles finding the right background,
    // loading into video elements, transitions, debouncing, etc.
    dealWithBackground({ currentChapter, currentParagraph });

    // Music: find track for reading position and preload
    const matchingTracks = backgroundSongsForBook.filter(
      (track) =>
        (currentChapter === track.chapter && currentParagraph >= track.paragraph) ||
        currentChapter > track.chapter,
    );
    const targetTrack = matchingTracks[matchingTracks.length - 1];

    if (targetTrack?.files?.[0]) {
      console.log("[CriticalAssetPreloader] Preloading music for position:", targetTrack.files[0]);
      const audio = new Audio();
      audio.preload = "auto";
      audio.src = targetTrack.files[0];
    }
  }, [isLoading, backgroundsForBook, backgroundSongsForBook, readingPosition]);
}
