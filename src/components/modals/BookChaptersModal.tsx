import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";

import ModalUI from "@/components/modals/ModalUI";
import { systemNavigateTo } from "@/helpers/paragraphsNavigation";
import { getChapterTitle } from "@/utils/getChapterTitle";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { getBookData } from "@/genericBookDataGetters/getBookData";
import { useLocationRange } from "@/hooks/useLocationRange";

interface BookChaptersModalProps {
  onClose: () => void;
}

const BookChaptersModal: React.FC<BookChaptersModalProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const { locationRange } = useLocationRange();
  const currentChapter = locationRange.currentChapter;

  const chapters = useMemo(() => {
    const bookData = getBookData();
    if (!bookData) {
      return [];
    }

    return bookData.chapters.map((chapter, index) => ({ id: parseInt(chapter.id), title: getChapterTitle(parseInt(chapter.id), t), page: (index + 1).toString() }));
  }, [t]);

  const navigateToChapter = (chapterId: number) => {
    systemNavigateTo({ currentChapter: chapterId, currentParagraph: 0 });
    onClose();
  };

  return (
    <ModalUI title={t("chapters")} onClose={onClose}>
      <ScrollArea className="h-[60vh] w-full">
        <div className="space-y-2 pr-4">
          {chapters.map((chapter) => {
            const isCurrentChapter = chapter.id === currentChapter;
            return (
              <Button
                variant="ghost"
                key={chapter.id}
                onClick={() => navigateToChapter(chapter.id)}
                className={`w-full justify-between text-left hover:bg-white/10 hover:text-white border-white/20 cursor-pointer ${
                  isCurrentChapter ? "bg-white/20 text-white border-white/40 font-semibold" : "text-white"
                }`}
              >
                <div className="flex items-center gap-3 font-medium">
                  {chapter.title}
                  {isCurrentChapter && <span className="text-green-400">●</span>}
                </div>
                <span className="text-sm text-muted-foreground">{chapter.page}</span>
              </Button>
            );
          })}
        </div>
      </ScrollArea>
    </ModalUI>
  );
};

export default BookChaptersModal;
