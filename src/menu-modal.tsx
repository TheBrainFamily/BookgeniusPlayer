import React, { useState, useEffect, useLayoutEffect, useMemo } from "react";
import { Book, X, List, FileText, PanelLeft, PanelBottom, Type, RotateCcw, Music } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { isNightMode } from "./helpers/setIsNightMode";
import { toggleMobileCharacters, isMobileCharactersVisible } from "./isMobileCharactersVisible";
import { resetFurthestPageLocation } from "./helpers/reset-furthest-page-location";
import { goToParagraph } from "./helpers/paragraphsNavigation";
import { preloadBackgroundTracks } from "./deal-with-background-songs";
import { BookData } from "./booksData/types";

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

type ModalType = null | "chapters" | "page";

interface BookChaptersModalProps {
  onShowDeepResearch: () => void;
  bookData: BookData;
}

const applyDarkMode = () => {
  if (isNightMode()) {
    document.body.classList.add("dark");
  } else {
    document.body.classList.remove("dark");
  }
};

export default function BookChaptersModal({ onShowDeepResearch, bookData }: BookChaptersModalProps) {
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [nightMode, setNightMode] = useState(isNightMode());
  const [pageNumber, setPageNumber] = useState("");
  const [charactersVertical, setCharactersVertical] = useState(isMobileCharactersVisible());
  const [fontSize, setFontSize] = useState(localStorage.getItem("fontSize") ? parseFloat(localStorage.getItem("fontSize")!) : 1);

  const chapters = useMemo(() => {
    if (!bookData || typeof bookData.chapters !== "number") {
      return [];
    }
    const pageChapters = Array.from({ length: bookData.chapters }, (_, i) => ({ chapter: i + 1, page: (i + 1).toString() }));
    return pageChapters.map((page) => ({ id: page.chapter, title: getTitle(page.chapter), page: page.page }));
  }, [bookData]);

  useEffect(() => {
    applyDarkMode();
  }, [nightMode]);

  useLayoutEffect(() => {
    const newFontSize = 16 * fontSize;
    const contentContainer = document.getElementById("content-container");
    if (contentContainer) {
      contentContainer.style.fontSize = `${newFontSize}px`;
    }
  }, [fontSize]);

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
    goToParagraph({ currentChapter: chapterId, currentParagraph: 0 });
    setActiveModal(null);
    setOverlayOpen(false);
  };

  const navigateToPage = () => {
    const page = Number.parseInt(pageNumber);
    if (!isNaN(page) && page > 0) {
      console.log(`Navigating to page ${page}`);
      // Implement your navigation logic here
      // For example: router.push(`/book/page/${page}`)
      setActiveModal(null);
      setOverlayOpen(false);
      setPageNumber("");
    }
  };

  const handleToggleCharacters = () => {
    console.log("[BOOK MODAL] handleToggleCharacters");
    toggleMobileCharacters();
    setCharactersVertical(isMobileCharactersVisible());
    setOverlayOpen(false);
  };

  const adjustFontSize = (sizeChange: number) => {
    console.log(`Adjusting font size multiplier to: ${sizeChange}`);
    setFontSize(sizeChange);
    localStorage.setItem("fontSize", sizeChange.toString()); // Save the multiplier
  };

  return (
    <>
      <div className="fixed z-50" style={{ top: "max(env(safe-area-inset-top, 0px), 1rem)", left: "1rem" }}>
        <Button size="icon" className="bg-white/20 backdrop-blur-md rounded-3xl p-[1.35rem] text-white" onClick={() => setOverlayOpen(true)}>
          <Book className="h-5 w-5 " />
          <span className="sr-only">Book options</span>
        </Button>
      </div>

      {/* Overlay with options */}
      {overlayOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center" onClick={() => setOverlayOpen(false)}>
          <div className="bg-background rounded-lg p-4 w-80 space-y-2" onClick={(e) => e.stopPropagation()}>
            <div className="md:hidden">
              <Button variant="ghost" className="w-full justify-start text-left" onClick={handleToggleCharacters}>
                {charactersVertical ? <PanelBottom className="mr-2 h-4 w-4" /> : <PanelLeft className="mr-2 h-4 w-4" />}
                Show Characters {charactersVertical ? "Horizontally" : "Vertically"}
              </Button>
            </div>

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
                preloadBackgroundTracks();
                setOverlayOpen(false);
              }}
            >
              <Music className="mr-2 h-4 w-4" />
              Background Music
            </Button>

            <Button
              variant="ghost"
              className="w-full justify-start text-left"
              onClick={() => {
                resetFurthestPageLocation();
                setOverlayOpen(false);
              }}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset Furthest Read Location
            </Button>

            <Separator />

            <Button
              variant="ghost"
              className="w-full justify-start text-left"
              onClick={() => {
                onShowDeepResearch();
                setOverlayOpen(false);
              }}
            >
              <FileText className="mr-2 h-4 w-4" />
              Show Deep Research
            </Button>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Type className="h-4 w-4" />
                <Label htmlFor="font-size" className="text-sm font-medium">
                  Font Size: {fontSize.toFixed(1)}x
                </Label>
              </div>

              <Slider id="font-size" min={0.5} max={1.5} step={0.1} value={[fontSize]} onValueChange={(value) => adjustFontSize(value[0])} aria-label="Font size" />

              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Small</span>
                <span>Default</span>
                <span>Large</span>
              </div>
            </div>
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
