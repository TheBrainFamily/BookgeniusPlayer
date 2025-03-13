import React, { useState, useEffect } from "react";
import { Book, Moon, X, List, FileText, PanelLeft, PanelBottom } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pageChapters } from "./chapters";
import { isNightMode, toggleNightMode } from "./helpers/setIsNightMode";
import { goToPage } from "./helpers/pagesNavigation";
import { toggleMobileCharacters, isMobileCharactersVisible } from "./isMobileCharactersVisible";

const getTitle = (chapter: number) => {
  const chapterNames = [
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
// Sample chapter data - replace with your actual data
const chapters = [...pageChapters.map((page) => ({ id: page.chapter, title: getTitle(page.chapter), page: page.pageId.replace("page_", "") }))];

type ModalType = null | "chapters" | "page";

export default function BookChaptersModal() {
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [nightMode, setNightMode] = useState(isNightMode());
  const [pageNumber, setPageNumber] = useState("");
  const [charactersVertical, setCharactersVertical] = useState(isMobileCharactersVisible());

  // Update the local state when the night mode changes externally
  useEffect(() => {
    const handleStorageChange = () => {
      setNightMode(isNightMode());
      setCharactersVertical(isMobileCharactersVisible());
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const navigateToChapter = (chapterId: number, page: string) => {
    const pageNum = parseInt(page, 10);
    console.log(`Navigating to chapter ${chapterId}, page ${pageNum}`);
    // Implement your navigation logic here
    // For example: router.push(`/book/chapter/${chapterId}`)
    goToPage(pageNum);
    setActiveModal(null);
    setOverlayOpen(false);
  };

  const navigateToPage = () => {
    const page = Number.parseInt(pageNumber);
    if (!isNaN(page) && page > 0) {
      console.log(`Navigating to page ${page}`);
      // Implement your navigation logic here
      // For example: router.push(`/book/page/${page}`)
      goToPage(page);
      setActiveModal(null);
      setOverlayOpen(false);
      setPageNumber("");
    }
  };

  const handleToggleNightMode = () => {
    toggleNightMode(); // Call the vanilla JS function
    setNightMode(isNightMode()); // Update the React state
    setOverlayOpen(false);
  };

  const handleToggleCharacters = () => {
    console.log("[BOOK MODAL] handleToggleCharacters");
    toggleMobileCharacters();
    setCharactersVertical(isMobileCharactersVisible());
    setOverlayOpen(false);
  };

  return (
    <>
      {/* Fixed button in top right corner */}
      <div className="fixed z-50" style={{ top: "max(env(safe-area-inset-top, 0px), 1rem)", right: "1rem" }}>
        <Button variant="outline" size="icon" className="rounded-full" onClick={() => setOverlayOpen(true)}>
          <Book className="h-5 w-5" />
          <span className="sr-only">Book options</span>
        </Button>
      </div>

      {/* Overlay with options */}
      {overlayOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center" onClick={() => setOverlayOpen(false)}>
          <div className="bg-background rounded-lg p-4 w-64 space-y-2" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" className="w-full justify-start text-left" onClick={handleToggleNightMode}>
              <Moon className="mr-2 h-4 w-4" />
              Night Mode {nightMode ? "(On)" : "(Off)"}
            </Button>

            <Button variant="ghost" className="w-full justify-start text-left" onClick={handleToggleCharacters}>
              {charactersVertical ? <PanelBottom className="mr-2 h-4 w-4" /> : <PanelLeft className="mr-2 h-4 w-4" />}
              Show Characters {charactersVertical ? "Horizontally" : "Vertically"}
            </Button>

            <Button
              variant="ghost"
              className="w-full justify-start text-left"
              onClick={() => {
                setActiveModal("chapters");
                setOverlayOpen(false);
              }}
            >
              <List className="mr-2 h-4 w-4" />
              Open Chapter
            </Button>

            <Button
              variant="ghost"
              className="w-full justify-start text-left"
              onClick={() => {
                setActiveModal("page");
                setOverlayOpen(false);
              }}
            >
              <FileText className="mr-2 h-4 w-4" />
              Go to Page
            </Button>

            <Button variant="ghost" size="icon" className="absolute top-2 right-2" onClick={() => setOverlayOpen(false)}>
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </Button>
          </div>
        </div>
      )}

      {/* Chapters Modal */}
      <Sheet
        open={activeModal === "chapters"}
        onOpenChange={(open) => {
          if (!open) setActiveModal(null);
        }}
      >
        <SheetContent side="bottom" className="h-[80vh] rounded-t-xl">
          <SheetHeader className="border-b pb-4">
            <SheetTitle className="text-lg font-medium">Chapters</SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-full py-4">
            <div className="space-y-1">
              {chapters.map((chapter) => (
                <button
                  key={chapter.id}
                  onClick={() => navigateToChapter(chapter.id, chapter.page)}
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
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Go to Page Modal */}
      <Sheet
        open={activeModal === "page"}
        onOpenChange={(open) => {
          if (!open) setActiveModal(null);
        }}
      >
        <SheetContent side="bottom" className="rounded-t-xl">
          <SheetHeader className="border-b pb-4">
            <SheetTitle className="text-lg font-medium">Go to Page</SheetTitle>
          </SheetHeader>
          <div className="py-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="page-number">Page Number</Label>
              <Input id="page-number" type="number" min="1" placeholder="Enter page number" value={pageNumber} onChange={(e) => setPageNumber(e.target.value)} />
            </div>
            <Button className="w-full" onClick={navigateToPage} disabled={!pageNumber || isNaN(Number.parseInt(pageNumber)) || Number.parseInt(pageNumber) < 1}>
              Go to Page
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
