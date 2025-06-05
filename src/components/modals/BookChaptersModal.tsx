import React, { useMemo } from "react";
import ModalUI from "@/components/modals/ModalUI";
import { systemNavigateTo } from "@/helpers/paragraphsNavigation";
import { getTitle } from "@/utils/getChapterTitle";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { getBookData } from "@/genericBookDataGetters/getBookData";
import { useTranslation } from "react-i18next";

interface BookChaptersModalProps {
  onClose: () => void;
}

const BookChaptersModal: React.FC<BookChaptersModalProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const bookData = getBookData();
  const chapters = useMemo(() => {
    if (!bookData || typeof bookData.chapters !== "number") {
      return [];
    }
    const pageChapters = Array.from({ length: bookData.chapters }, (_, i) => ({ chapter: i + 1, page: (i + 1).toString() }));
    return pageChapters.map((page) => ({ id: page.chapter, title: getTitle(page.chapter), page: page.page }));
  }, [bookData]);

  const navigateToChapter = (chapterId: number) => {
    systemNavigateTo({ currentChapter: chapterId, currentParagraph: 0 });
    onClose();
  };

  return (
    <ModalUI title={t("chapters")} onClose={onClose}>
      <ScrollArea className="max-h-[60vh]">
        <div className="space-y-2">
          {chapters.map((chapter) => (
            <Button
              variant="ghost"
              key={chapter.id}
              onClick={() => navigateToChapter(chapter.id)}
              className="w-full justify-between text-left text-white hover:bg-white/10 hover:text-white border-white/20 cursor-pointer"
            >
              <div className="flex items-center gap-3 font-medium">{chapter.title}</div>
              <span className="text-sm text-muted-foreground">p. {chapter.page}</span>
            </Button>
          ))}
        </div>
      </ScrollArea>
    </ModalUI>
  );
};

export default BookChaptersModal;
