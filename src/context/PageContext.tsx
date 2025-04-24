import React, { createContext, useContext, useState } from "react";

interface PageContextType {
  currentChapter: number;
  setCurrentChapter: (chapter: number) => void;
  currentParagraph: number;
  setCurrentParagraph: (paragraph: number) => void;
  totalPages: number;
  setTotalPages: (pages: number) => void;
}

const PageContext = createContext<PageContextType | undefined>(undefined);

export const usePage = () => {
  const context = useContext(PageContext);
  if (!context) {
    throw new Error("usePage must be used within a PageProvider");
  }
  return context;
};

export const PageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentChapter, setCurrentChapter] = useState(1);
  const [currentParagraph, setCurrentParagraph] = useState(1);
  const [totalPages, setTotalPages] = useState(250);

  return <PageContext.Provider value={{ currentChapter, setCurrentChapter, currentParagraph, setCurrentParagraph, totalPages, setTotalPages }}>{children}</PageContext.Provider>;
};
