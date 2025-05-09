import React, { useEffect, createContext, useContext, useState, ReactNode } from "react";

declare global {
  interface Window {
    __sidebarScrollingLock: boolean;
  }
}

type Appearance = { chapterNumber: number; paragraphNumber: number; isTalkingInParagraph: boolean };

interface HighlightContextType {
  highlightParagraphs: (appearances: Appearance[], enable: boolean) => void;
  isScrollingLocked: boolean;
  setScrollingLocked: (locked: boolean) => void;
}

const HighlightContext = createContext<HighlightContextType | undefined>(undefined);

export const useHighlight = (): HighlightContextType => {
  const context = useContext(HighlightContext);
  if (context === undefined) {
    throw new Error("useHighlight must be used within a HighlightProvider");
  }
  return context;
};

interface HighlightProviderProps {
  children: ReactNode;
}

export const HighlightProvider: React.FC<HighlightProviderProps> = ({ children }) => {
  const [isScrollingLocked, setScrollingLocked] = useState(false);

  const highlightParagraphs = (appearances: Appearance[], enable: boolean): void => {
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
