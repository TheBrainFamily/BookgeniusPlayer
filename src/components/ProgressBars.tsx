import React, { useState, useEffect } from "react";
import { getBookData } from "@/genericBookDataGetters/getBookData";
import { useReadingProgress } from "@/hooks/useReadingProgress";

export interface ChapterStructure {
  chapterNumber: number;
  paragraphCount: number;
}

const ProgressBars: React.FC = () => {
  const [chaptersStructure, setChaptersStructure] = useState<ChapterStructure[]>([]);
  const [totalParagraphs, setTotalParagraphs] = useState(0);

  const { chapterProgress, bookProgress, furthestProgress } = useReadingProgress(chaptersStructure, totalParagraphs);

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

  if (chaptersStructure.length === 0) {
    return null;
  }

  return (
    <>
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: "10px", backgroundColor: "rgba(139, 69, 19, 0.2)", zIndex: 9999 }}>
        <div style={{ height: "100%", width: `${chapterProgress}%`, background: "linear-gradient(to right, #8B4513, #CD853F)", opacity: 0.7 }} />
      </div>
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, height: "10px", backgroundColor: "rgba(139, 69, 19, 0.2)", zIndex: 9998 }}>
        <div style={{ height: "100%", width: `${furthestProgress}%`, background: "linear-gradient(to right, #88888830, #bbbbbb30)" }} />
      </div>
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, height: "10px", backgroundColor: "rgba(139, 69, 19, 0.2)", zIndex: 9999 }}>
        <div style={{ height: "100%", width: `${bookProgress}%`, background: "linear-gradient(to right, #A0522D, #F4A460)", opacity: 0.7 }} />
      </div>
    </>
  );
};

export default ProgressBars;
