import React, { useEffect, useState, useRef } from "react";
import { List, Type, RotateCcw, Music, Brain } from "lucide-react";
import useLocalStorageState from "use-local-storage-state";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { getCurrentLocation } from "@/helpers/paragraphsNavigation";
import { cn } from "@/lib/utils";
import ModalUI from "./ModalUI";

interface BookMenuModalProps {
  onClose: () => void;
  openBookChapterModal: () => void;
  preloadBackgroundTracks: () => void;
  resetFurthestPageLocation: () => void;
}

const hideNonVisibleParagraphs = (currentChapter: number, currentParagraph: number) => {
  document.querySelectorAll("[data-chapter]").forEach((chapter: HTMLElement) => {
    const id = parseInt(chapter.dataset.chapter || "0");
    if (Math.abs(id - currentChapter) > 0) {
      chapter.style.display = "none";
    } else {
      chapter.style.display = "block";
    }
  });
  console.log(`currentChapter: ${currentChapter}, currentParagraph: ${currentParagraph}`);
  console.log(``);
  document.querySelectorAll(`[data-chapter="${currentChapter}"] [data-index]`).forEach((paragraph: HTMLElement) => {
    const id = parseInt(paragraph.dataset.index || "0");
    if (id < currentParagraph) {
      paragraph.style.display = "none";
    } else {
      paragraph.style.display = "block";
    }
  });
};

const displayAllChapters = () => {
  document.querySelectorAll("[data-chapter]").forEach((chapter: HTMLElement) => {
    chapter.style.display = "block";
  });
  document.querySelectorAll("[data-index]").forEach((paragraph: HTMLElement) => {
    paragraph.style.display = "block";
  });
};

const BookMenuModal: React.FC<BookMenuModalProps> = ({ onClose, openBookChapterModal, preloadBackgroundTracks, resetFurthestPageLocation }) => {
  const [currentFontSize, setCurrentFontSize] = useLocalStorageState("fontSize", { defaultValue: 1 });
  const [hideOverlay, setHideOverlay] = useState(false);
  const overlayTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hiddenParagraphsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleFontSizeChange = (value: number[]) => {
    const fontSize = value[0];

    if (overlayTimeoutRef.current) {
      clearTimeout(overlayTimeoutRef.current);
    }

    const currentLocation = getCurrentLocation();
    console.log("location currentChapter", currentLocation.currentChapter);
    hideNonVisibleParagraphs(currentLocation.currentChapter, currentLocation.currentParagraph);
    setTimeout(() => {
      setCurrentFontSize(fontSize);
    }, 200);

    if (!hideOverlay) {
      setHideOverlay(true);
    }

    if (hiddenParagraphsTimeoutRef.current) {
      clearTimeout(hiddenParagraphsTimeoutRef.current);
    }

    if (overlayTimeoutRef.current) {
      clearTimeout(overlayTimeoutRef.current);
    }

    overlayTimeoutRef.current = setTimeout(() => {
      setHideOverlay(false);
    }, 1500);
    hiddenParagraphsTimeoutRef.current = setTimeout(() => {
      displayAllChapters();
    }, 1500);
  };

  useEffect(() => {
    return () => {
      if (overlayTimeoutRef.current) {
        clearTimeout(overlayTimeoutRef.current);
      }
      if (hiddenParagraphsTimeoutRef.current) {
        clearTimeout(hiddenParagraphsTimeoutRef.current);
        displayAllChapters();
      }
    };
  }, []);

  return (
    <ModalUI title="Ustawienia Książki" onClose={onClose} hideOverlay={hideOverlay}>
      <div className="space-y-2 mb-6">
        <Button
          variant="ghost"
          className="w-full justify-start text-left text-white hover:bg-white/10 hover:text-white border-white/20 cursor-pointer"
          onClick={() => {
            openBookChapterModal();
          }}
        >
          <List className="mr-2 h-4 w-4" />
          Otwórz Rodział
        </Button>
        <Button
          variant="ghost"
          className="w-full justify-start text-left text-white hover:bg-white/10 hover:text-white border-white/20 cursor-pointer"
          onClick={() => {
            preloadBackgroundTracks();
            onClose();
          }}
        >
          <Music className="mr-2 h-4 w-4" />
          Przeładuj Muzykę
        </Button>
        <Button
          variant="ghost"
          className="w-full justify-start text-left text-white hover:bg-white/10 hover:text-white border-white/20 cursor-pointer"
          onClick={() => {
            resetFurthestPageLocation();
            onClose();
          }}
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Resetuj Pozycję Czytania
        </Button>
        <Button
          variant="ghost"
          className="w-full justify-start text-left text-white hover:bg-white/10 hover:text-white border-white/20 cursor-pointer"
          onClick={() => {
            const newApiKey = prompt("OpenAI API Key") || "";
            if (newApiKey) {
              localStorage.setItem("tmp::voice_api_key", newApiKey);
              console.warn("need to pass it to the voice agent now");
            }
            onClose();
          }}
        >
          <Brain className="mr-2 h-4 w-4" />
          Ustaw klucz OpenAI
        </Button>
      </div>
      <div className={cn("p-4 rounded-lg bg-black/50 border border-white/20 transition-all duration-300")}>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Type className="h-4 w-4 text-white" />
            <Label htmlFor="font-size" className="text-sm font-medium text-white">
              Rozmiar tekstu: <span id="font-size-value" className="text-blue-300">{`${currentFontSize.toFixed(1)}x`}</span>
            </Label>
          </div>
          <Slider
            id="font-size"
            variant="secondary"
            min={0.5}
            max={1.5}
            step={0.1}
            value={[currentFontSize]}
            onValueChange={handleFontSizeChange}
            aria-label="Rozmiar tekstu"
            className="[&_[role=slider]]:bg-white [&_[role=slider]]:border-white/50"
          />
          <div className="flex justify-between text-xs text-gray-300">
            <span>Mały</span>
            <span>Domyślny</span>
            <span>Duży</span>
          </div>
        </div>
      </div>
      <div className="text-xs text-gray-500 mt-4 text-right">
        <span>Wersja: {import.meta.env.VITE_BUILD_TIME || "0.0.1"}</span>
      </div>
    </ModalUI>
  );
};

export default BookMenuModal;
