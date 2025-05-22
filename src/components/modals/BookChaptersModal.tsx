import React, { useMemo } from "react";
import ModalUI from "@/components/modals/ModalUI";
import { BookData } from "@/booksData/types";
import { goToParagraph } from "@/helpers/paragraphsNavigation";

const getTitle = (chapter: number) => {
  const chapterNames = [
    "Zero",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
    "Twenty",
    "Twenty-One",
    "Twenty-Two",
    "Twenty-Three",
    "Twenty-Four",
    "Twenty-Five",
    "Twenty-Six",
    "Twenty-Seven",
  ];
  return `Chapter ${chapterNames[chapter] || chapter}`;
};

interface BookChaptersModalProps {
  open: boolean;
  onClose: () => void;
  bookData: BookData;
}

const BookChaptersModal: React.FC<BookChaptersModalProps> = ({ open, onClose, bookData }) => {
  const chapters = useMemo(() => {
    if (!bookData || typeof bookData.chapters !== "number") {
      return [];
    }
    const pageChapters = Array.from({ length: bookData.chapters }, (_, i) => ({ chapter: i + 1, page: (i + 1).toString() }));
    return pageChapters.map((page) => ({ id: page.chapter, title: getTitle(page.chapter), page: page.page }));
  }, [bookData]);

  const navigateToChapter = (chapterId: number) => {
    goToParagraph({ currentChapter: chapterId, currentParagraph: 0 });
    onClose();
  };

  if (!open) return null;

  return (
    <ModalUI title="Chapters" onClose={onClose}>
      <div className="h-[60vh] overflow-y-auto space-y-1">
        {chapters.map((chapter) => (
          <button
            key={chapter.id}
            onClick={() => navigateToChapter(chapter.id)}
            className="w-full rounded-md px-4 py-3 text-left transition-colors hover:bg-muted active:bg-muted/80"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-medium">{chapter.title}</span>
              </div>
              <span className="text-sm text-muted-foreground">p. {chapter.page}</span>
            </div>
          </button>
        ))}
      </div>
    </ModalUI>
  );
};

export default BookChaptersModal;
