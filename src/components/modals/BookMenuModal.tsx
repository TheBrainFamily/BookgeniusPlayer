import React, { useEffect } from "react";
import { List, Type, RotateCcw, Music } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { BookData } from "@/booksData/types";
import ModalUI from "./ModalUI";

interface BookMenuModalProps {
  onClose: () => void;
  bookData: BookData;
  openBookChapterModal: () => void;
  preloadBackgroundTracks: () => void;
  resetFurthestPageLocation: () => void;
}

const BookMenuModal: React.FC<BookMenuModalProps> = ({ onClose, openBookChapterModal, preloadBackgroundTracks, resetFurthestPageLocation }) => {
  const currentFontSize = Number(localStorage.getItem("fontSize") || "1");

  useEffect(() => {
    // Initialize the font size display when the component mounts
    const fontSizeValueElement = document.getElementById("font-size-value");
    if (fontSizeValueElement) {
      fontSizeValueElement.textContent = `${currentFontSize.toFixed(1)}x`;
    }
  }, [currentFontSize]);

  return (
    <ModalUI title="Ustawienia Książki" onClose={onClose}>
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
      </div>
      <div className="p-4 rounded-lg bg-black/50 border border-white/20">
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
    </ModalUI>
  );
};

export default BookMenuModal;
