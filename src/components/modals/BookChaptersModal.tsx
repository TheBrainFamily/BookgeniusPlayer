import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";

import ModalUI from "@/components/modals/ModalUI";
import { systemNavigateTo } from "@/helpers/paragraphsNavigation";
import { getChapterTitle } from "@/utils/getChapterTitle";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { getBookData } from "@/genericBookDataGetters/getBookData";

interface BookChaptersModalProps {
  onClose: () => void;
}

const BookChaptersModal: React.FC<BookChaptersModalProps> = ({ onClose }) => {
  const { t } = useTranslation();

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
      <ScrollArea className="max-h-[60vh] space-y-2">
        {chapters.map((chapter) => (
          <Button
            variant="ghost"
            key={chapter.id}
            onClick={() => navigateToChapter(chapter.id)}
            className="w-full justify-between text-left text-white hover:bg-white/10 hover:text-white border-white/20 cursor-pointer"
          >
            <div className="flex items-center gap-3 font-medium">{chapter.title}</div>
            <span className="text-sm text-muted-foreground">{chapter.page}</span>
          </Button>
        ))}
      </ScrollArea>
    </ModalUI>
  );
};

export default BookChaptersModal;
