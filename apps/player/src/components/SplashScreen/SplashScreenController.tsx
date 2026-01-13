/**
 * SplashScreenController - Controls an existing splash screen element
 *
 * For standalone mode where HTML already contains #splash-screen.
 * This component doesn't render anything - it just controls the existing DOM.
 */
import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { genericPhrases } from "./genericPhrases";
import { SPLASH_FADE_DURATION_MS } from "./constants";

export interface SplashScreenControllerProps {
  /** Book data - if provided, updates the splash with real content */
  book?: { title: string; author?: string; loadingPhrases?: string[] };
  /** If true, auto-hide when ready (no Start button click needed) */
  autoStart?: boolean;
  /** Callback when splash is fully hidden */
  onHidden?: () => void;
}

/**
 * Controller for existing HTML splash screen.
 * Handles phrase rotation, ready state, and hide animation.
 */
export function SplashScreenController({
  book,
  autoStart = false,
  onHidden,
}: SplashScreenControllerProps) {
  const [isReady, setIsReady] = useState(false);
  const [isHiding, setIsHiding] = useState(false);

  // Refs for phrase rotation and cleanup
  const previousPhrasesRef = useRef(new Set<string>());
  const usingGenericRef = useRef(false);
  const phraseIntervalRef = useRef<number | null>(null);
  const fadeTimeoutRef = useRef<number | null>(null);
  const blurTimeoutRef = useRef<number | null>(null);
  const hideTimeoutRef = useRef<number | null>(null);

  const bookPhrases = useMemo(() => book?.loadingPhrases ?? [], [book?.loadingPhrases]);

  /**
   * Get a random phrase
   */
  const getRandomPhrase = useCallback(() => {
    const previousPhrases = previousPhrasesRef.current;

    const pickFrom = (arr: string[]) => {
      const options = arr.filter((p) => !previousPhrases.has(p));
      if (options.length === 0) return null;
      const choice = options[Math.floor(Math.random() * options.length)];
      previousPhrases.add(choice);
      return choice;
    };

    let phrase = usingGenericRef.current ? pickFrom(genericPhrases) : pickFrom(bookPhrases);
    if (phrase) return phrase;

    if (!usingGenericRef.current) {
      usingGenericRef.current = true;
      phrase = pickFrom(genericPhrases);
      if (phrase) return phrase;
    }

    previousPhrases.clear();
    usingGenericRef.current = false;
    phrase = pickFrom(bookPhrases) ?? pickFrom(genericPhrases);
    return phrase ?? "Loading...";
  }, [bookPhrases]);

  /**
   * Update the phrase element in the DOM
   */
  const updatePhrase = useCallback(() => {
    const phraseElement = document.getElementById("loading-phrase");
    if (!phraseElement) return;

    phraseElement.style.animation = "textFadeOut 0.3s ease-out forwards";
    fadeTimeoutRef.current = window.setTimeout(() => {
      phraseElement.textContent = getRandomPhrase();
      phraseElement.style.animation = "textFadeIn 0.5s ease-out forwards";
      // Force remove blur after animation completes
      if (blurTimeoutRef.current) window.clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = window.setTimeout(() => {
        phraseElement.style.filter = "blur(0)";
      }, 600);
    }, 300);
  }, [getRandomPhrase]);

  /**
   * Hide the splash screen
   */
  const hideSplash = useCallback(() => {
    if (isHiding) return;
    setIsHiding(true);

    const splashElement = document.getElementById("splash-screen");
    if (splashElement) {
      splashElement.classList.add("splash-screen--hide");
    }

    if (phraseIntervalRef.current) {
      window.clearInterval(phraseIntervalRef.current);
      phraseIntervalRef.current = null;
    }

    if (hideTimeoutRef.current) window.clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("splashHidden"));
      onHidden?.();
    }, SPLASH_FADE_DURATION_MS);
  }, [isHiding, onHidden]);

  /**
   * Update splash with book data when available
   */
  useEffect(() => {
    if (!book) return;

    const titleEl = document.querySelector(".splash-title");
    const subtitleEl = document.querySelector(".splash-subtitle");

    if (titleEl) titleEl.textContent = book.title;
    if (subtitleEl && book.author) subtitleEl.textContent = book.author;
  }, [book]);

  /**
   * Setup phrase rotation - runs once on mount
   */
  useEffect(() => {
    // Set initial phrase immediately and ensure filter is removed
    const phraseElement = document.getElementById("loading-phrase");
    if (phraseElement) {
      // Get first phrase inline (don't use callback to avoid re-render issues)
      const firstPhrase = bookPhrases[0] ?? genericPhrases[0] ?? "Loading...";
      previousPhrasesRef.current.add(firstPhrase);
      phraseElement.textContent = firstPhrase;
      // Force remove blur after animation would complete
      blurTimeoutRef.current = window.setTimeout(() => {
        phraseElement.style.filter = "blur(0)";
      }, 600);
    }

    // Start phrase rotation and store ref so hideSplash can clear it
    phraseIntervalRef.current = window.setInterval(() => {
      updatePhrase();
    }, 1700);

    return () => {
      if (phraseIntervalRef.current) window.clearInterval(phraseIntervalRef.current);
      if (fadeTimeoutRef.current) window.clearTimeout(fadeTimeoutRef.current);
      if (blurTimeoutRef.current) window.clearTimeout(blurTimeoutRef.current);
      if (hideTimeoutRef.current) window.clearTimeout(hideTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Run once on mount
  }, []);

  /**
   * Listen for appReady event
   */
  useEffect(() => {
    const handleReady = () => setIsReady(true);
    window.addEventListener("appReady", handleReady);
    return () => window.removeEventListener("appReady", handleReady);
  }, []);

  /**
   * Handle ready state - show button or auto-hide
   */
  useEffect(() => {
    if (!isReady) return;

    if (autoStart) {
      hideSplash();
    } else {
      // Show the start button
      const startButton = document.getElementById("start-button");
      if (startButton) {
        startButton.classList.remove("disabled");
        startButton.classList.add("visible");
      }
    }
  }, [isReady, autoStart, hideSplash]);

  /**
   * Setup start button click handler
   */
  useEffect(() => {
    const startButton = document.getElementById("start-button");
    if (!startButton) return;

    const handleClick = () => {
      if (isReady && !isHiding) {
        hideSplash();
      }
    };

    startButton.addEventListener("click", handleClick);
    return () => startButton.removeEventListener("click", handleClick);
  }, [isReady, isHiding, hideSplash]);

  // This component doesn't render anything - it controls existing DOM
  return null;
}
