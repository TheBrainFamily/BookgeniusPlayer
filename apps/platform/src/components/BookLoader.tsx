import React, { useState, useEffect, useRef } from "react";

import "./BookLoader.css";
import { genericPhrases } from "./genericPhrases";

interface BookLoaderProps {
  title: string;
  author: string;
  loadingPhrases: string[];
  isLoaded: boolean;
  showStartButton?: boolean;
  onStartClick?: () => void;
}

export const BookLoader: React.FC<BookLoaderProps> = ({ title, author, loadingPhrases, isLoaded, showStartButton = false, onStartClick }) => {
  const [currentPhrase, setCurrentPhrase] = useState("");
  const [isFading, setIsFading] = useState(false);
  const [isHiding, setIsHiding] = useState(false);

  // Tracks every phrase shown in the current cycle (both book + generic)
  const previousPhrases = useRef(new Set<string>());
  // Tracks which pool we're currently drawing from
  const usingGenericRef = useRef(false);

  // Keep references to timers to prevent dangling timeouts on unmount
  const phraseIntervalRef = useRef<number | null>(null);
  const fadeTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    // Reset cycle whenever the book-specific phrases list changes
    previousPhrases.current.clear();
    usingGenericRef.current = false;

    const getRandomPhrase = () => {
      const book = (loadingPhrases ?? []).filter(Boolean);
      const generic = (genericPhrases ?? []).filter(Boolean);

      if (book.length === 0 && generic.length === 0) return "Loading...";

      const used = previousPhrases.current;

      const pickFrom = (arr: string[]) => {
        const options = arr.filter((p) => !used.has(p));
        if (options.length === 0) return null;
        const choice = options[Math.floor(Math.random() * options.length)];
        used.add(choice);
        return choice;
      };

      // 1) Try current pool (book first, then generic)
      let phrase = usingGenericRef.current ? pickFrom(generic) : pickFrom(book);
      if (phrase) return phrase;

      // 2) If book is exhausted, switch to generic
      if (!usingGenericRef.current) {
        usingGenericRef.current = true;
        phrase = pickFrom(generic);
        if (phrase) return phrase;
      }

      // 3) If generic also exhausted (or started on generic and it's exhausted), reset everything
      used.clear();
      usingGenericRef.current = false;

      // Prefer book on a fresh cycle; fall back to generic if book is empty
      phrase = pickFrom(book) ?? pickFrom(generic);
      return phrase ?? "Loading...";
    };

    // Initial phrase
    setCurrentPhrase(getRandomPhrase());

    // Rotate phrases with a small crossfade
    phraseIntervalRef.current = window.setInterval(() => {
      setIsFading(true);
      // Short delay to allow fade-out before swapping text
      fadeTimeoutRef.current = window.setTimeout(() => {
        setCurrentPhrase(getRandomPhrase());
        setIsFading(false);
      }, 300);
    }, 1700);

    return () => {
      if (phraseIntervalRef.current) window.clearInterval(phraseIntervalRef.current);
      if (fadeTimeoutRef.current) window.clearTimeout(fadeTimeoutRef.current);
    };
  }, [loadingPhrases]);

  useEffect(() => {
    if (isLoaded) setIsHiding(true);
  }, [isLoaded]);

  return (
    <div className={`book-loader-splash ${isHiding ? "hide" : ""} relative px-4 sm:px-6 lg:px-8`}>
      <div className="text-center space-y-6 sm:space-y-8 lg:space-y-10 max-w-4xl mx-auto">
        <div className="mb-6 sm:mb-8 lg:mb-16">
          <h1 className="splash-title text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl">{title}</h1>
          <h2 className="splash-subtitle text-sm sm:text-base md:text-lg lg:text-xl mt-2 sm:mt-3">{author}</h2>
        </div>

        <div className="h-6 sm:h-8 lg:h-10" aria-live="polite">
          <p className={`splash-loading-text text-sm sm:text-base lg:text-lg px-2 sm:px-4 ${isFading ? "fading-out" : "fading-in"}`}>{currentPhrase}</p>
        </div>

        <div className="mt-6 sm:mt-8 lg:mt-16 h-12 sm:h-14 lg:h-16 flex items-center justify-center">
          <button
            onClick={onStartClick}
            disabled={!showStartButton || !onStartClick}
            aria-hidden={!showStartButton}
            tabIndex={showStartButton ? 0 : -1}
            className={`
              bg-black/20 backdrop-blur-sm rounded-full border border-white/20 
              text-white font-semibold 
              px-4 sm:px-6 md:px-8 py-2 sm:py-2 md:py-4
              min-h-[40px] sm:min-h-[44px] text-sm sm:text-base
              flex items-center justify-center gap-2 sm:gap-2 md:gap-3
              shadow-2xl
              transition-all duration-1000 ease-out
              hover:scale-105 hover:border-white/40 hover:bg-black/30 hover:shadow-white/25
              active:scale-100 active:shadow-white/15
              cursor-pointer
              ${showStartButton ? "opacity-100" : "opacity-0 pointer-events-none"}
            `}
            style={{ animation: showStartButton ? "buttonPulse 4s ease-in-out infinite" : "none", willChange: "transform, opacity, box-shadow" }}
          >
            <div className="play-icon" aria-hidden="true">
              <div className="w-0 h-0 border-l-[10px] sm:border-l-[12px] border-l-white border-t-[6px] sm:border-t-[8px] border-t-transparent border-b-[6px] sm:border-b-[8px] border-b-transparent ml-1"></div>
            </div>
            <span className="min-w-[3em] sm:min-w-[4em] text-center transition-opacity duration-300">Start</span>
          </button>
        </div>
      </div>
    </div>
  );
};
