import React, { createContext, useEffect, useState } from "react";
import { BOOK_SLUGS, CURRENT_BOOK } from "@/consts";
import { BookThemeColors } from "@/books/types";
import { getBookData } from "@/genericBookDataGetters/getBookData";

interface BookThemeContextType {
  bookSlug: BOOK_SLUGS;
  themeColors: BookThemeColors;
  setThemeColors: (colors: BookThemeColors) => void;
}
const BookThemeContext = createContext<BookThemeContextType>({ bookSlug: CURRENT_BOOK, themeColors: getBookData().themeColors, setThemeColors: () => {} });

const applyThemeToDocument = (themeColors: BookThemeColors) => {
  const root = document.documentElement;

  root.style.setProperty("--book-primary-color", themeColors.primaryColor);
  root.style.setProperty("--book-secondary-color", themeColors.secondaryColor);
  root.style.setProperty("--book-tertiary-color", themeColors.tertiaryColor);
  root.style.setProperty("--book-quaternary-color", themeColors.quaternaryColor);
};

export const BookThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [bookSlug] = useState<BOOK_SLUGS>(CURRENT_BOOK);
  const [themeColors, setThemeColors] = useState<BookThemeColors>(getBookData().themeColors);

  useEffect(() => {
    applyThemeToDocument(themeColors);
  }, [themeColors]);

  return <BookThemeContext.Provider value={{ bookSlug, themeColors, setThemeColors }}>{children}</BookThemeContext.Provider>;
};
