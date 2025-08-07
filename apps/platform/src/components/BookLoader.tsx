// src/components/BookLoader.tsx
import React, { useState, useEffect, useRef } from "react";
import "./BookLoader.css"; // We'll create this file for animations

// Define the props the component will accept
interface BookLoaderProps {
  title: string;
  subtitle: string;
  loadingPhrases: string[];
  isLoaded: boolean; // Control when the loader should hide
}

export const BookLoader: React.FC<BookLoaderProps> = ({ title, subtitle, loadingPhrases, isLoaded }) => {
  const [currentPhrase, setCurrentPhrase] = useState("");
  const [isFading, setIsFading] = useState(false);
  const [isHiding, setIsHiding] = useState(false);

  // Use a ref to keep track of previous phrases without causing re-renders
  const previousPhrases = useRef(new Set<string>());

  // Effect for cycling through loading phrases
  useEffect(() => {
    const getRandomPhrase = () => {
      if (loadingPhrases.length === 0) return "Loading...";
      // Reset memory if we've used most of the phrases
      if (previousPhrases.current.size > loadingPhrases.length - 5) {
        previousPhrases.current.clear();
      }
      let phrase;
      do {
        phrase = loadingPhrases[Math.floor(Math.random() * loadingPhrases.length)];
      } while (previousPhrases.current.has(phrase) && loadingPhrases.length > 1);

      previousPhrases.current.add(phrase);
      return phrase;
    };

    // Set the initial phrase immediately
    setCurrentPhrase(getRandomPhrase());

    const phraseInterval = setInterval(() => {
      setIsFading(true); // Trigger fade-out animation
      setTimeout(() => {
        setCurrentPhrase(getRandomPhrase());
        setIsFading(false); // Trigger fade-in animation
      }, 300); // Duration of fade-out animation
    }, 3000); // Change phrase every 3 seconds

    // Cleanup function to stop the interval when the component unmounts
    return () => clearInterval(phraseInterval);
  }, [loadingPhrases]);

  // Effect to handle the final fade-out of the entire screen
  useEffect(() => {
    if (isLoaded) {
      setIsHiding(true);
    }
  }, [isLoaded]);

  // The component uses `position: fixed` to cover the whole screen,
  // just like the original HTML version.
  return (
    <div className={`book-loader-splash ${isHiding ? "hide" : ""}`}>
      <div className="text-center">
        {/* Title and Subtitle */}
        <div className="mb-16">
          <h1 className="splash-title">{title}</h1>
          <h2 className="splash-subtitle">{subtitle}</h2>
        </div>

        {/* Loading Phrase with fade animation */}
        <div className="h-8">
          {" "}
          {/* Container to prevent layout shift */}
          <p className={`splash-loading-text ${isFading ? "fading-out" : "fading-in"}`}>{currentPhrase}</p>
        </div>
      </div>
    </div>
  );
};
