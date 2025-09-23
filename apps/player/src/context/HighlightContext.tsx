import React, { useEffect, useState, ReactNode, useMemo } from "react";
import { getBookData } from "@player/genericBookDataGetters/getBookData";
import { HighlightContext } from "@player/hooks/useHighlight";

declare global {
  interface Window {
    __sidebarScrollingLock: boolean;
  }
}

type Appearance = { chapterNumber: number; paragraphNumber: number; isTalkingInParagraph: boolean };

export interface HighlightContextType {
  highlightParagraphs: (appearances: Appearance[], enable: boolean) => void;
  isScrollingLocked: boolean;
  setScrollingLocked: (locked: boolean) => void;
}

interface HighlightProviderProps {
  children: ReactNode;
}

export const HighlightProvider: React.FC<HighlightProviderProps> = ({ children }) => {
  const [isScrollingLocked, setScrollingLocked] = useState(false);

  const isPlayFormat = useMemo(() => getBookData().metadata.bookForm === "play" || getBookData().metadata.bookForm === "mixed", []);

  const highlightParagraphs = (appearances: Appearance[], enable: boolean): void => {
    // Don't highlight paragraphs for play format books
    if (isPlayFormat) return;

    appearances.forEach(({ chapterNumber, paragraphNumber, isTalkingInParagraph }) => {
      const p = document.querySelector<HTMLElement>(`section[data-chapter="${chapterNumber}"] [data-index="${paragraphNumber}"]`);
      if (!p) return;
      p.classList.toggle("highlighted-paragraph", enable);
      p.classList.toggle("talking-paragraph", enable && isTalkingInParagraph);
    });
  };

  useEffect(() => {
    window.__sidebarScrollingLock = isScrollingLocked;

    return () => {
      window.__sidebarScrollingLock = false;
    };
  }, [isScrollingLocked]);

  return <HighlightContext.Provider value={{ highlightParagraphs, isScrollingLocked, setScrollingLocked }}>{children}</HighlightContext.Provider>;
};
