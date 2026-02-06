/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useCallback, useState } from "react";
import { X, BookOpen, Play } from "lucide-react";
import { Button } from "@platform/components/ui/button";
import { Badge } from "@platform/components/ui/badge";
import type { CollectionBook } from "./StandardEbooksBookCard";

interface BookModalProps {
  book: CollectionBook | null;
  onClose: () => void;
  onSelect: (slug: string) => void;
}

export function BookModal({ book, onClose, onSelect }: BookModalProps) {
  const [isClosing, setIsClosing] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [displayedBook, setDisplayedBook] = useState<CollectionBook | null>(null);

  useEffect(() => {
    if (book) {
      setDisplayedBook(book);
      setIsClosing(false);
      setIsVisible(false);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsVisible(true);
        });
      });
    }
  }, [book]);

  const triggerClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setDisplayedBook(null);
    }, 150);
  }, [onClose]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") triggerClose();
    },
    [triggerClose],
  );

  useEffect(() => {
    if (book) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [book, handleKeyDown]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) triggerClose();
    },
    [triggerClose],
  );

  const handleSelect = useCallback(() => {
    if (displayedBook) {
      onSelect(displayedBook.slug);
      triggerClose();
    }
  }, [displayedBook, onSelect, triggerClose]);

  if (!book && !displayedBook) return null;
  const shownBook = displayedBook ?? book;
  if (!shownBook) return null;

  const currentBook = shownBook;

  const coverWidth = 340;
  const coverHeight = 510;
  const panelWidth = 320;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm transition-opacity duration-200 ${isClosing || !isVisible ? "opacity-0" : "opacity-100"}`}
      onClick={handleBackdropClick}
    >
      <button
        onClick={triggerClose}
        className="absolute top-6 right-6 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
      >
        <X className="w-6 h-6 text-white" />
      </button>

      <div
        className={`flex items-stretch transition-all duration-200 ${isClosing || !isVisible ? "opacity-0 scale-95" : "opacity-100 scale-100"}`}
        style={{ height: coverHeight }}
      >
        {currentBook.generatedDescription && (
          <div
            className="bg-card rounded-l-2xl flex flex-col justify-center p-8 overflow-hidden"
            style={{ width: panelWidth, height: coverHeight }}
          >
            <p className="text-base text-muted-foreground leading-relaxed line-clamp-[12]">
              {currentBook.generatedDescription}
            </p>
          </div>
        )}

        <div
          className={`bg-card flex flex-col justify-center p-8 overflow-hidden ${!currentBook.generatedDescription ? "rounded-l-2xl" : ""}`}
          style={{ width: panelWidth, height: coverHeight }}
        >
          <div className="mb-4">
            <h2 className="font-bold text-2xl text-foreground leading-tight tracking-tight">
              {currentBook.title}
            </h2>
            <p className="text-lg text-muted-foreground mt-2">{currentBook.author}</p>
          </div>

          {currentBook.generatedHook && (
            <div className="py-6 flex-1">
              <div className="relative pl-5 border-l-2 border-primary/40">
                <p className="text-lg font-medium text-primary italic leading-snug">
                  "{currentBook.generatedHook}"
                </p>
              </div>
            </div>
          )}

          <div className="mt-auto">
            <div className="flex flex-wrap gap-2 mb-5">
              {currentBook.epoch && (
                <Badge
                  variant="outline"
                  className="text-sm px-3 py-1 h-7 font-normal bg-secondary/20 border-secondary-foreground/10 text-secondary-foreground"
                >
                  {currentBook.epoch}
                </Badge>
              )}
              {currentBook.genre && (
                <Badge
                  variant="outline"
                  className="text-sm px-3 py-1 h-7 font-normal bg-secondary/20 border-secondary-foreground/10 text-secondary-foreground"
                >
                  {currentBook.genre}
                </Badge>
              )}
              {currentBook.kind && (
                <Badge
                  variant="outline"
                  className="text-sm px-3 py-1 h-7 font-normal bg-secondary/20 border-secondary-foreground/10 text-secondary-foreground"
                >
                  {currentBook.kind}
                </Badge>
              )}
            </div>

            <Button
              className="w-full gap-3 font-medium text-lg h-12 shadow-md hover:shadow-lg transition-all"
              onClick={handleSelect}
            >
              <Play className="w-5 h-5 fill-current" />
              Read Now
            </Button>
          </div>
        </div>

        <div
          className="relative flex-shrink-0 overflow-hidden rounded-r-2xl"
          style={{
            width: coverWidth,
            height: coverHeight,
            backgroundColor: currentBook.coverColor || "#333",
          }}
        >
          {currentBook.cover ? (
            <img
              src={currentBook.cover}
              alt={currentBook.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <BookOpen className="w-20 h-20 text-white/50" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
