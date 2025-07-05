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

  const { chapterProgress, bookProgress } = useMemo(() => {
    if (chaptersStructure.length === 0 || !location) {
      return { chapterProgress: 0, bookProgress: 0 };
    }

    const currentChapter = location.currentChapter || 1;
    const currentParagraph = location.currentParagraph || 0;

    const currentChapterData = chaptersStructure.find((ch) => ch.chapterNumber === currentChapter);

    const chapterProg = currentChapterData ? Math.min(((currentParagraph + 1) / currentChapterData.paragraphCount) * 100, 100) : 0;

    const savedLocation = getSavedLocation();
    const savedChapter = savedLocation?.currentChapter || 1;
    const savedParagraph = savedLocation?.currentParagraph || 0;

    let readParagraphs = 0;

    for (const chapter of chaptersStructure) {
      if (chapter.chapterNumber < savedChapter) {
        readParagraphs += chapter.paragraphCount;
      } else if (chapter.chapterNumber === savedChapter) {
        readParagraphs += Math.min(savedParagraph + 1, chapter.paragraphCount);
        break;
      }
    }

    const bookProg = totalParagraphs > 0 ? (readParagraphs / totalParagraphs) * 100 : 0;

    return { chapterProgress: chapterProg, bookProgress: bookProg };
  }, [chaptersStructure, totalParagraphs, location]);

  if (chaptersStructure.length === 0) {
    return null;
  }

  return (
    <>
      <div
        style={{ position: "fixed", top: 0, left: 0, right: 0, height: "3px", backgroundColor: "rgba(139, 69, 19, 0.2)", zIndex: 9999, boxShadow: "0 2px 5px rgba(0, 0, 0, 0.4)" }}
      >
        <div style={{ height: "100%", width: `${chapterProgress}%`, background: "linear-gradient(to right, #8B4513, #CD853F)", transition: "width 0.8s ease-out" }} />
      </div>

      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          height: "3px",
          backgroundColor: "rgba(139, 69, 19, 0.2)",
          zIndex: 9999,
          boxShadow: "0 -2px 5px rgba(0, 0, 0, 0.4)",
        }}
      >
        <div style={{ height: "100%", width: `${bookProgress}%`, background: "linear-gradient(to right, #A0522D, #F4A460)", transition: "width 0.8s ease-out" }} />
      </div>
    </>
  );
};

export default ProgressBars;
