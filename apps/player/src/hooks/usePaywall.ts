import { getBookData } from "@player/genericBookDataGetters/getBookData";
import { bookDataLoader } from "@player/services/bookDataLoader";
import { useLocation } from "@player/state/LocationContext";
import { useEffect } from "react";

export const usePaywall = () => {
  const { location } = useLocation();

  const { currentChapter } = location;
  useEffect(() => {
    if (bookDataLoader.getBookVisibility() !== "full") {
      let timeout: ReturnType<typeof setTimeout>;
      if ((getBookData().metadata.bookForm === "play" && currentChapter > 2) || (getBookData().metadata.bookForm === "book" && currentChapter > 1)) {
        timeout = setTimeout(() => {
          window.dispatchEvent(new CustomEvent("ShowPaywall", { detail: { bookSlug: getBookData().slug, bookTitle: getBookData().metadata.title } }));
        }, 2000);
      }
      return () => clearTimeout(timeout);
    }
  }, [currentChapter]);
};
