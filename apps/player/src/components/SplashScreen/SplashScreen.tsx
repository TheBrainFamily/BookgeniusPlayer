/* eslint-disable react-hooks/set-state-in-effect */
/**
 * SplashScreen - Unified loading screen for BookGenius Player
 *
 * Replaces both:
 * - Player's vanilla JS SplashScreenManager (in index.html)
 * - Platform's BookLoader React component
 *
 * Features:
 * - Rotating loading phrases (book-specific + generic fallback)
 * - Optional video loader
 * - Start button for direct URL access (audio context needs user interaction)
 * - Auto-start mode for platform click flow (already had user interaction)
 *
 * Usage:
 * - Platform: <SplashScreen book={bookData} autoStart={true} />
 * - Standalone: <SplashScreen book={bookData} autoStart={false} />
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { genericPhrases } from "./genericPhrases";
import "./SplashScreen.css";

export interface SplashScreenBook {
  title: string;
  author: string;
  loadingPhrases?: string[];
  loaderVideoSrc?: string;
}

export interface SplashScreenProps {
  book: SplashScreenBook;
  /** If true, auto-hide when ready (user already clicked on platform) */
  autoStart: boolean;
  /** Optional callback when splash is hidden */
  onHidden?: () => void;
  /**
   * External control mode (for platform RouteTransitionProvider):
   * - When provided, this controls visibility instead of internal appReady listener
   * - When true, splash hides
   * - When false/undefined, splash shows
   */
  isLoaded?: boolean;
  /** Show start button (external control) - overrides autoStart behavior */
  showStartButton?: boolean;
  /** Callback when start button is clicked (for external control) */
  onStartClick?: () => void;
}

/**
 * Get a random phrase from an array, avoiding previously shown phrases
 */
function pickRandomPhrase(arr: string[], previousPhrases: Set<string>): string | null {
  const options = arr.filter((p) => !previousPhrases.has(p));
  if (options.length === 0) return null;
  const choice = options[Math.floor(Math.random() * options.length)];
  previousPhrases.add(choice);
  return choice;
}

export function SplashScreen({
  book,
  autoStart,
  onHidden,
  isLoaded,
  showStartButton: externalShowStartButton,
  onStartClick: externalOnStartClick,
}: SplashScreenProps) {
  // External control mode: isLoaded prop overrides internal ready state
  const isExternalControlled = isLoaded !== undefined;
  // Track which phrases have been shown to avoid repetition
  const previousPhrasesRef = useRef(new Set<string>());
  const usingGenericRef = useRef(false);

  // Memoize book phrases to avoid changing dependencies
  const bookPhrases = useMemo(() => book.loadingPhrases ?? [], [book.loadingPhrases]);

  // Get initial phrase - just pick the first book phrase or first generic phrase
  const initialPhrase = bookPhrases[0] ?? genericPhrases[0] ?? "Loading...";

  const [currentPhrase, setCurrentPhrase] = useState(initialPhrase);
  const [isFading, setIsFading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isHiding, setIsHiding] = useState(false);

  // Timers
  const phraseIntervalRef = useRef<number | null>(null);
  const fadeTimeoutRef = useRef<number | null>(null);

  /**
   * Get a random phrase, cycling through book phrases first, then generic
   */
  const getRandomPhrase = useCallback(() => {
    const previousPhrases = previousPhrasesRef.current;

    // Try current pool (book first, then generic)
    let phrase = usingGenericRef.current
      ? pickRandomPhrase(genericPhrases, previousPhrases)
      : pickRandomPhrase(bookPhrases, previousPhrases);
    if (phrase) return phrase;

    // If book is exhausted, switch to generic
    if (!usingGenericRef.current) {
      usingGenericRef.current = true;
      phrase = pickRandomPhrase(genericPhrases, previousPhrases);
      if (phrase) return phrase;
    }

    // If both exhausted, reset and start over
    previousPhrases.clear();
    usingGenericRef.current = false;
    phrase =
      pickRandomPhrase(bookPhrases, previousPhrases) ??
      pickRandomPhrase(genericPhrases, previousPhrases);
    return phrase ?? "Loading...";
  }, [bookPhrases]);

  /**
   * Hide the splash screen with animation
   */
  const hideSplash = useCallback(() => {
    if (isHiding) return;
    setIsHiding(true);

    // Dispatch splashHidden event after transition
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("splashHidden"));
      onHidden?.();
    }, 1000);
  }, [isHiding, onHidden]);

  /**
   * Initialize phrase cycling
   */
  useEffect(() => {
    // Reset when book changes
    previousPhrasesRef.current.clear();
    usingGenericRef.current = false;

    // Add initial phrase to shown set
    previousPhrasesRef.current.add(initialPhrase);

    // Rotate phrases every 1.7 seconds with crossfade
    phraseIntervalRef.current = window.setInterval(() => {
      setIsFading(true);
      fadeTimeoutRef.current = window.setTimeout(() => {
        setCurrentPhrase(getRandomPhrase());
        setIsFading(false);
      }, 300);
    }, 1700);

    return () => {
      if (phraseIntervalRef.current) window.clearInterval(phraseIntervalRef.current);
      if (fadeTimeoutRef.current) window.clearTimeout(fadeTimeoutRef.current);
    };
  }, [getRandomPhrase, initialPhrase]);

  /**
   * Listen for 'appReady' event from the player (only in internal control mode)
   */
  useEffect(() => {
    if (isExternalControlled) return;

    const handleReady = () => {
      setIsReady(true);
    };

    window.addEventListener("appReady", handleReady);
    return () => window.removeEventListener("appReady", handleReady);
  }, [isExternalControlled]);

  /**
   * Auto-hide when ready if autoStart is true (internal control mode)
   */
  useEffect(() => {
    if (isExternalControlled) return;
    if (autoStart && isReady && !isHiding) {
      hideSplash();
    }
  }, [isExternalControlled, autoStart, isReady, isHiding, hideSplash]);

  /**
   * External control mode: visibility is driven by the parent overlay.
   * We intentionally do NOT auto-hide here to avoid race conditions.
   * The parent decides when to dispatch splashHidden and fade out.
   */
  useEffect(() => {
    if (!isExternalControlled) return;
    if (isHiding) {
      setIsHiding(false);
    }
  }, [isExternalControlled, isHiding]);

  /**
   * Handle Start button click
   */
  const handleStartClick = () => {
    if (externalOnStartClick) {
      externalOnStartClick();
    } else {
      hideSplash();
    }
  };

  // Determine if start button should be shown
  // External mode: use externalShowStartButton prop
  // Internal mode: show if !autoStart
  const shouldShowStartButton = isExternalControlled ? externalShowStartButton : !autoStart;

  // Determine if start button is enabled
  // External mode: enabled when externalShowStartButton is true
  // Internal mode: enabled when isReady
  const isButtonEnabled = isExternalControlled ? externalShowStartButton : isReady;

  return (
    <div id="splash-screen" className={`splash-screen ${isHiding ? "splash-screen--hide" : ""}`}>
      <div className="splash-container">
        <div className="splash-inner">
          <div className="splash-title-container">
            <h1 className="splash-title">{book.title || "Loading..."}</h1>
            <h2 className="splash-subtitle">{book.author}</h2>
          </div>

          {book.loaderVideoSrc && (
            <div className="splash-image-container">
              <video
                id="splash-video"
                src={book.loaderVideoSrc}
                poster="/clear-loader.png"
                className="splash-loading-image"
                muted
                autoPlay
                playsInline
                preload="auto"
              />
            </div>
          )}

          <div className="splash-text-container">
            <p className={`splash-loading-text ${isFading ? "fading-out" : "fading-in"}`}>
              {currentPhrase}
            </p>
          </div>

          <div className="splash-button-container">
            <button
              className={`splash-start-button ${shouldShowStartButton && isButtonEnabled ? "visible" : "disabled"}`}
              onClick={handleStartClick}
              disabled={!isButtonEnabled}
              aria-hidden={!shouldShowStartButton}
              tabIndex={shouldShowStartButton && isButtonEnabled ? 0 : -1}
            >
              <div className="play-icon">
                <div className="play-triangle" />
              </div>
              <span>Start</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
