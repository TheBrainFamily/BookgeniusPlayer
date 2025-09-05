import React, { createContext, useEffect, useState } from "react";
import { BOOK_SLUGS } from "@player/consts";
import { BookThemeColors } from "@player/types/book";
import { getBookData } from "@player/genericBookDataGetters/getBookData";
import { bookDataLoader } from "@player/services/bookDataLoader";
import { loadBookColorsCSS } from "@player/utils/loadBookColors";

interface BookThemeContextType {
  bookSlug: BOOK_SLUGS;
  themeColors: BookThemeColors;
  setThemeColors: (colors: BookThemeColors) => void;
}
const BookThemeContext = createContext<BookThemeContextType>({
  bookSlug: bookDataLoader.getCurrentBook() as BOOK_SLUGS,
  themeColors: getBookData().themeColors,
  setThemeColors: () => {},
});

const applyThemeToDocument = (themeColors: BookThemeColors) => {
  const root = document.documentElement;

  root.style.setProperty("--book-primary-color", themeColors.primaryColor);
  root.style.setProperty("--book-secondary-color", themeColors.secondaryColor);
  root.style.setProperty("--book-tertiary-color", themeColors.tertiaryColor);
  root.style.setProperty("--book-quaternary-color", themeColors.quaternaryColor);
  if (themeColors.simplifiedIconColor) {
    root.style.setProperty("--book-simplified-icon-color", themeColors.simplifiedIconColor);
  }
};

export const BookThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [bookSlug] = useState<BOOK_SLUGS>(bookDataLoader.getCurrentBook() as BOOK_SLUGS);
  const [themeColors, setThemeColors] = useState<BookThemeColors>(getBookData().themeColors);

  useEffect(() => {
    applyThemeToDocument(themeColors);
  }, [themeColors]);

  useEffect(() => {
    // Load optional book-specific color CSS file
    loadBookColorsCSS(bookSlug);
  }, [bookSlug]);

  return <BookThemeContext.Provider value={{ bookSlug, themeColors, setThemeColors }}>{children}</BookThemeContext.Provider>;
};
