import { useBookConvex } from "@player/context/BookConvexContext";
import { useLocation } from "@player/state/LocationContext";
import { useEffect } from "react";
import useSplashHidden from "./useSplashHidden";

// TODO: Implement proper visibility check from Convex or URL params
const getBookVisibility = (): "full" | "preview" => {
  const urlParams = new URLSearchParams(window.location.search);
  // For now, assume full access unless explicitly set to preview
  return urlParams.get("visibility") === "preview" ? "preview" : "full";
};

export const usePaywall = () => {
  const { location } = useLocation();
  const isSplashHidden = useSplashHidden();
  const { bookData } = useBookConvex();

  const { currentChapter } = location;
  useEffect(() => {
    if (!isSplashHidden || !bookData) return;

    const visibility = getBookVisibility();
    if (visibility !== "full") {
      let timeout: ReturnType<typeof setTimeout>;
      const bookForm = bookData.metadata.bookForm;
      if ((bookForm === "play" && currentChapter > 2) || ((bookForm === "book" || bookForm === "mixed") && currentChapter > 1)) {
        timeout = setTimeout(() => {
          window.dispatchEvent(new CustomEvent("ShowPaywall", { detail: { bookSlug: bookData.slug, bookTitle: bookData.metadata.title } }));
        }, 2000);
      }
      return () => clearTimeout(timeout);
    }
  }, [currentChapter, isSplashHidden, bookData]);
};
