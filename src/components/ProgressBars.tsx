import React, { useState, useEffect, useMemo } from "react";
import { useLocation } from "@/state/LocationContext";
import { getSavedLocation } from "@/helpers/paragraphsNavigation";
import { getBookData } from "@/genericBookDataGetters/getBookData";

interface ChapterStructure {
  chapterNumber: number;
  paragraphCount: number;
}

const ProgressBars: React.FC = () => {
  const { location } = useLocation();

  const [chaptersStructure, setChaptersStructure] = useState<ChapterStructure[]>([]);
  const [totalParagraphs, setTotalParagraphs] = useState(0);

  useEffect(() => {
    try {
      const bookDataString = getBookData().bookStringified;
      const parser = new window.DOMParser();
      const htmlDoc = parser.parseFromString(bookDataString, "text/html");

      const chapters = Array.from(htmlDoc.querySelectorAll("section[data-chapter]"));
      const structure: ChapterStructure[] = [];
      let total = 0;

      chapters.forEach((chapter) => {
        const chapterNumber = parseInt(chapter.getAttribute("data-chapter") || "0");
        const paragraphCount = chapter.querySelectorAll("[data-index]").length;

        structure.push({ chapterNumber, paragraphCount });
        total += paragraphCount;
      });

      setChaptersStructure(structure);
      setTotalParagraphs(total);
    } catch (error) {
      console.error("❌ Error parsing book data:", error);
    }
  }, []);

  const { chapterProgress, bookProgress, furthestProgress } = useMemo(() => {
    if (chaptersStructure.length === 0 || !location) {
      return { chapterProgress: 0, bookProgress: 0, furthestProgress: 0 };
    }

    const currentChapter = location.currentChapter || 1;
    const currentParagraph = location.currentParagraph || 0;

    const currentChapterData = chaptersStructure.find((ch) => ch.chapterNumber === currentChapter);

    const chapterProg = currentChapterData ? Math.min(((currentParagraph + 1) / currentChapterData.paragraphCount) * 100, 100) : 0;

    // Current position in book
    let currentReadParagraphs = 0;
    for (const chapter of chaptersStructure) {
      if (chapter.chapterNumber < currentChapter) {
        currentReadParagraphs += chapter.paragraphCount;
      } else if (chapter.chapterNumber === currentChapter) {
        currentReadParagraphs += Math.min(currentParagraph + 1, chapter.paragraphCount);
        break;
      }
    }
    const bookProg = totalParagraphs > 0 ? (currentReadParagraphs / totalParagraphs) * 100 : 0;

    // Furthest position in book (saved location)
    const savedLocation = getSavedLocation();
    const savedChapter = savedLocation?.currentChapter || 1;
    const savedParagraph = savedLocation?.currentParagraph || 0;

    let furthestReadParagraphs = 0;
    for (const chapter of chaptersStructure) {
      if (chapter.chapterNumber < savedChapter) {
        furthestReadParagraphs += chapter.paragraphCount;
      } else if (chapter.chapterNumber === savedChapter) {
        furthestReadParagraphs += Math.min(savedParagraph + 1, chapter.paragraphCount);
        break;
      }
    }
    const furthestProg = totalParagraphs > 0 ? (furthestReadParagraphs / totalParagraphs) * 100 : 0;

    return { chapterProgress: chapterProg, bookProgress: bookProg, furthestProgress: furthestProg };
  }, [chaptersStructure, totalParagraphs, location]);

  if (chaptersStructure.length === 0) {
    return null;
  }

  return (
    <>
      <div
        style={{ position: "fixed", top: 0, left: 0, right: 0, height: "6px", backgroundColor: "rgba(139, 69, 19, 0.2)", zIndex: 9999, boxShadow: "0 2px 5px rgba(0, 0, 0, 0.4)" }}
      >
        <div style={{ height: "100%", width: `${chapterProgress}%`, background: "linear-gradient(to right, #8B4513, #CD853F)", transition: "width 0.8s ease-out" }} />
      </div>

      {/* Bottom progress bars container */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, height: "6px", zIndex: 9999, boxShadow: "0 -2px 5px rgba(0, 0, 0, 0.4)" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "6px", backgroundColor: "rgba(139, 69, 19, 0.2)" }}>
          <div style={{ height: "100%", width: `${furthestProgress}%`, background: "linear-gradient(to right, #888, #bbb)", transition: "width 0.8s ease-out" }} />
        </div>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "6px", backgroundColor: "transparent" }}>
          <div style={{ height: "100%", width: `${bookProgress}%`, background: "linear-gradient(to right, #A0522D, #F4A460)", transition: "width 0.8s ease-out" }} />
        </div>
      </div>
    </>
  );
};

export default ProgressBars;
