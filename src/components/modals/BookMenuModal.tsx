import React, { useEffect } from "react";
import { List, FileText, Type, RotateCcw, Music } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import ModalUI from "@/components/modals/ModalUI";
import { BookData } from "@/booksData/types";

interface BookMenuModalProps {
  onClose: () => void;
  bookData: BookData; // Kept for future use with bookData
  openBookChapterModal: () => void;
  openDeepResearchModal: (content?: string) => void;
  preloadBackgroundTracks: () => void;
  resetFurthestPageLocation: () => void;
}

const BookMenuModal: React.FC<BookMenuModalProps> = ({ onClose, openBookChapterModal, openDeepResearchModal, preloadBackgroundTracks, resetFurthestPageLocation }) => {
  const currentFontSize = Number(localStorage.getItem("fontSize") || "1");

  useEffect(() => {
    // Initialize the font size display when the component mounts
    const fontSizeValueElement = document.getElementById("font-size-value");
    if (fontSizeValueElement) {
      fontSizeValueElement.textContent = `${currentFontSize.toFixed(1)}x`;
    }
  }, [currentFontSize]);

  return (
    <ModalUI title="Book Menu" onClose={onClose}>
      <div className="w-80 space-y-2">
        <Button
          variant="ghost"
          className="w-full justify-start text-left"
          onClick={() => {
            openBookChapterModal();
            // onClose();
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
            onClose();
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
            onClose();
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
            // Check if deep research is enabled
            // Note: we're removing the specific enableDeepResearch check
            // and will rely on the context to handle this
            // Dispatch a custom event that can be caught by components with custom handlers
            const event = new CustomEvent("showDeepResearch");
            document.dispatchEvent(event);
            // Also use the default handler
            openDeepResearchModal();
            onClose();
          }}
        >
          <FileText className="mr-2 h-4 w-4" />
          Show Deep Research
        </Button>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Type className="h-4 w-4" />
            <Label htmlFor="font-size" className="text-sm font-medium">
              Font Size: <span id="font-size-value">{`${currentFontSize.toFixed(1)}x`}</span>
            </Label>
          </div>

          <Slider
            id="font-size"
            min={0.5}
            max={1.5}
            step={0.1}
            value={[currentFontSize]}
            onValueChange={(value) => {
              const fontSize = value[0];
              const fontSizeValueElement = document.getElementById("font-size-value");
              if (fontSizeValueElement) {
                fontSizeValueElement.textContent = `${fontSize.toFixed(1)}x`;
              }
              localStorage.setItem("fontSize", fontSize.toString());
              const newFontSize = 16 * fontSize;
              const contentContainer = document.getElementById("content-container");
              if (contentContainer) {
                contentContainer.style.fontSize = `${newFontSize}px`;
              }
            }}
            aria-label="Font size"
          />

          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Small</span>
            <span>Default</span>
            <span>Large</span>
          </div>
        </div>
      </div>
    </ModalUI>
  );
};

export default BookMenuModal;
