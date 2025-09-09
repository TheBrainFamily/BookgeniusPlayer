import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";

import ModalUI from "@player/components/modals/ModalUI";
import { systemNavigateTo } from "@player/helpers/paragraphsNavigation";
import { getChapterTitle } from "@player/utils/getChapterTitle";
import { Button } from "../ui/button";
import { getBookData } from "@player/genericBookDataGetters/getBookData";
import { useLocationRange } from "@player/hooks/useLocationRange";

interface BookChaptersModalProps {
  onClose: () => void;
}

const BookChaptersModal: React.FC<BookChaptersModalProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const {
    locationRange: { currentChapter },
  } = useLocationRange();

  const chapters = useMemo(() => {
    const bookData = getBookData();

    return bookData.chapters.map((chapter, index) => ({ id: parseInt(chapter.id), title: getChapterTitle(parseInt(chapter.id), t), page: (index + 1).toString() }));
  }, [t]);

  const navigateToChapter = (chapterId: number) => {
    systemNavigateTo({ currentChapter: chapterId, currentParagraph: 0 });
    onClose();
  };

  return (
    <ModalUI title={t("chapters")} onClose={onClose}>
      <div className="container max-h-[60vh] overflow-y-auto scrollbar-search">
        {chapters.map((chapter) => {
          const isCurrentChapter = chapter.id === currentChapter;

          return (
            <Button
              variant="ghost"
              key={chapter.id}
              onPointerUp={(e) => {
                e.preventDefault();
                e.stopPropagation();

                navigateToChapter(chapter.id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();

                  navigateToChapter(chapter.id);
                }
              }}
              className={`w-full min-w-0 h-auto !justify-between !items-start text-left px-3 py-2 hover:bg-white/10 cursor-pointer hover:text-white border-white/20 ${
                isCurrentChapter ? "bg-white/20 text-white border-white/40 font-bold" : "text-white"
              }`}
            >
              <div className="grid w-full min-w-0 grid-cols-[1fr_auto] items-start gap-3">
                <span
                  className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap sm:whitespace-normal sm:line-clamp-2 leading-snug"
                  title={chapter.title}
                  aria-label={chapter.title}
                >
                  {chapter.title}
                </span>
                <span className="shrink-0 text-sm text-muted-foreground tabular-nums">{chapter.page}</span>
              </div>
            </Button>
          );
        })}
      </div>
    </ModalUI>
  );
};

export default BookChaptersModal;
