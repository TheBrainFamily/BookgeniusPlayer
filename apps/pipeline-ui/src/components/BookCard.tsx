import { useState, useEffect, useCallback, useRef } from "react";
import { BookOpen, Play, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export type CollectionBook = {
  title: string;
  author: string;
  slug: string;
  cover: string;
  coverThumb: string;
  coverColor: string;
  epoch: string;
  genre: string;
  kind: string;
  hasAudio: boolean;
  generatedDescription?: string;
  generatedHook?: string;
  readingTime?: string;
};

export interface BookCardProps {
  book: CollectionBook;
  onSelect: (slug: string) => void;
  onOpenModal?: (book: CollectionBook) => void;
  index: number;
  totalColumns: number;
}

// eslint-disable-next-line complexity
export function BookCard({ book, onSelect, onOpenModal, index, totalColumns }: BookCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const hoverTimeoutRef = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const isRightSide = index % totalColumns >= totalColumns / 2;

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
    hoverTimeoutRef.current = window.setTimeout(() => {
      setIsExpanded(true);
    }, 500);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsExpanded(false);
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  const handleStartClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect(book.slug);
    },
    [book.slug, onSelect],
  );

  const handleCardClick = useCallback(() => {
    if (onOpenModal) {
      onOpenModal(book);
    } else if (!isExpanded) {
      onSelect(book.slug);
    }
  }, [isExpanded, book, onSelect, onOpenModal]);

  const panelWidth = 275;

  const coverElement = (
    <div className="relative flex-shrink-0" style={{ width: "100%" }}>
      <div
        className="aspect-[2/3] overflow-hidden mb-3 transition-[border-radius] duration-300 rounded-xl"
        style={{
          backgroundColor: book.coverColor || "#333",
          borderRadius: isExpanded
            ? isRightSide
              ? "0 0.75rem 0.75rem 0"
              : "0.75rem 0 0 0.75rem"
            : "0.75rem",
        }}
      >
        {book.cover ? (
          <img
            src={book.cover}
            alt={book.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <BookOpen className="w-14 h-14 text-white/50" />
          </div>
        )}
        <div
          className="absolute inset-0 pointer-events-none transition-opacity duration-300"
          style={{
            opacity: isExpanded ? 1 : 0,
            background: isRightSide
              ? "linear-gradient(to right, hsl(var(--card) / 0.6) 0%, hsl(var(--card) / 0.3) 10%, transparent 30%)"
              : "linear-gradient(to left, hsl(var(--card) / 0.6) 0%, hsl(var(--card) / 0.3) 10%, transparent 30%)",
          }}
        />
      </div>
    </div>
  );

  const infoElement = (
    <div
      className="flex-shrink-0 overflow-hidden transition-all duration-300 ease-out bg-card relative z-10"
      style={{
        width: isExpanded ? panelWidth : 0,
        opacity: isExpanded ? 1 : 0,
        marginLeft: isRightSide ? 0 : -2,
        marginRight: isRightSide ? -2 : 0,
        marginTop: -1,
        marginBottom: 11,
      }}
    >
      <div className="h-full p-5 flex flex-col" style={{ width: panelWidth }}>
        <div>
          <h3 className="font-bold text-lg text-foreground line-clamp-2 leading-tight tracking-tight">
            {book.title}
          </h3>
          <p className="text-base text-muted-foreground mt-1">{book.author}</p>
          {book.readingTime && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span>{book.readingTime}</span>
            </div>
          )}
        </div>

        {book.generatedHook && (
          <div className="flex-1 flex items-center py-4">
            <div className="relative pl-4 border-l-2 border-primary/40">
              <p className="text-base font-medium text-primary italic leading-snug">
                "{book.generatedHook}"
              </p>
            </div>
          </div>
        )}

        <div className="mt-auto">
          <div className="flex flex-wrap gap-2 mb-4">
            {book.epoch && (
              <Badge
                variant="outline"
                className="text-xs px-2.5 py-0.5 h-6 font-normal bg-secondary/20 border-secondary-foreground/10 text-secondary-foreground"
              >
                {book.epoch}
              </Badge>
            )}
            {book.genre && (
              <Badge
                variant="outline"
                className="text-xs px-2.5 py-0.5 h-6 font-normal bg-secondary/20 border-secondary-foreground/10 text-secondary-foreground"
              >
                {book.genre}
              </Badge>
            )}
            {book.kind && (
              <Badge
                variant="outline"
                className="text-xs px-2.5 py-0.5 h-6 font-normal bg-secondary/20 border-secondary-foreground/10 text-secondary-foreground"
              >
                {book.kind}
              </Badge>
            )}
          </div>

          <Button
            className="w-full gap-2 font-medium shadow-sm hover:shadow-md transition-all"
            size="default"
            onClick={handleStartClick}
          >
            <Play className="w-4 h-4 fill-current" />
            Read Now
          </Button>
        </div>
      </div>
    </div>
  );

  const descElement = book.generatedDescription ? (
    <div
      className="flex-shrink-0 overflow-hidden transition-all duration-300 ease-out bg-card relative z-10"
      style={{
        width: isExpanded ? panelWidth : 0,
        opacity: isExpanded ? 1 : 0,
        borderRadius: isRightSide ? "0.75rem 0 0 0.75rem" : "0 0.75rem 0.75rem 0",
        boxShadow: isExpanded ? "0 25px 50px -12px rgba(0, 0, 0, 0.5)" : "none",
        marginTop: -1,
        marginBottom: 11,
      }}
    >
      <div className="h-full p-5 flex flex-col justify-center" style={{ width: panelWidth }}>
        <p className="text-sm text-muted-foreground leading-relaxed">{book.generatedDescription}</p>
      </div>
    </div>
  ) : null;

  return (
    <div
      ref={cardRef}
      className="relative cursor-pointer group"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ zIndex: isHovered ? 50 : 1 }}
      onClick={handleCardClick}
    >
      <div
        className="transition-transform duration-300 ease-out will-change-transform"
        style={{
          transform: isHovered ? "scale(1.02)" : "scale(1)",
          transformOrigin: isRightSide ? "right top" : "left top",
        }}
      >
        <div className="flex" style={{ justifyContent: isRightSide ? "flex-end" : "flex-start" }}>
          {isRightSide ? (
            <>
              {descElement}
              {infoElement}
              {coverElement}
            </>
          ) : (
            <>
              {coverElement}
              {infoElement}
              {descElement}
            </>
          )}
        </div>

        <div className="h-[72px] mt-3">
          <h3
            className={`text-base font-medium line-clamp-2 transition-opacity duration-300 ${isExpanded ? "opacity-0" : "opacity-100"}`}
          >
            {book.title}
          </h3>
          <p
            className={`text-sm text-muted-foreground line-clamp-1 transition-opacity duration-300 ${isExpanded ? "opacity-0" : "opacity-100"}`}
          >
            {book.author}
          </p>
        </div>
      </div>
    </div>
  );
}
