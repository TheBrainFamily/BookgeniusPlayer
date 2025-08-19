// src/components/BookLoader.tsx
import React, { useState, useEffect, useRef } from "react";
import "./BookLoader.css";
import { genericPhrases } from "./genericPhrases";

interface BookLoaderProps {
  title: string;
  author: string;
  loadingPhrases: string[];
  isLoaded: boolean;
}

export const BookLoader: React.FC<BookLoaderProps> = ({ title, author, loadingPhrases, isLoaded }) => {
  const [currentPhrase, setCurrentPhrase] = useState("");
  const [isFading, setIsFading] = useState(false);
  const [isHiding, setIsHiding] = useState(false);

  // Tracks every phrase shown in the current cycle (both book + generic)
  const previousPhrases = useRef(new Set<string>());
  // Tracks which pool we're currently drawing from
  const usingGenericRef = useRef(false);

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

    const phraseInterval = setInterval(() => {
      setIsFading(true);
      setTimeout(() => {
        setCurrentPhrase(getRandomPhrase());
        setIsFading(false);
      }, 300);
    }, 1700);

    return () => clearInterval(phraseInterval);
  }, [loadingPhrases]);

  useEffect(() => {
    if (isLoaded) {
      setIsHiding(true);
    }
  }, [isLoaded]);

  return (
    <div className={`book-loader-splash ${isHiding ? "hide" : ""} pointer-events-none`}>
      <div className="text-center">
        <div className="mb-16">
          <h1 className="splash-title">{title}</h1>
          <h2 className="splash-subtitle">{author}</h2>
        </div>
        <div className="h-8">
          <p className={`splash-loading-text ${isFading ? "fading-out" : "fading-in"}`}>{currentPhrase}</p>
        </div>
      </div>
    </div>
  );
};
