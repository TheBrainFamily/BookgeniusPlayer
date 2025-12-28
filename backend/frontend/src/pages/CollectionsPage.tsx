import { useState, useEffect, useCallback, useRef } from "react";
import { trpc } from "../trpc";
import { Loader2, BookOpen, ArrowLeft, Library, Play, Clock, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Collection = { title: string; slug: string; url: string };

type CollectionBook = {
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
};

type CollectionDetails = { url: string; title?: string; books: CollectionBook[] };

interface CollectionsPageProps {
  onSelectBook: (slug: string) => void;
  onBack: () => void;
}

interface BookCardProps {
  book: CollectionBook;
  onSelect: (slug: string) => void;
  index: number;
  totalColumns: number;
}

function BookCard({ book, onSelect, index, totalColumns }: BookCardProps) {
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
    if (!isExpanded) {
      onSelect(book.slug);
    }
  }, [isExpanded, book.slug, onSelect]);

  const detailsPanelWidth = 200;

  return (
    <div
      ref={cardRef}
      className="relative cursor-pointer"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ zIndex: isHovered ? 50 : 1 }}
      onClick={handleCardClick}
    >
      <div
        className="transition-transform duration-300 ease-out will-change-transform"
        style={{ transform: isHovered ? "scale(1.05)" : "scale(1)", transformOrigin: isRightSide ? "right top" : "left top" }}
      >
        <div className="flex" style={{ flexDirection: isRightSide ? "row-reverse" : "row" }}>
          <div className="relative flex-shrink-0" style={{ width: "100%" }}>
            <div
              className="aspect-[2/3] overflow-hidden mb-2 transition-[border-radius] duration-300 rounded-lg"
              style={{ backgroundColor: book.coverColor || "#333", borderRadius: isExpanded ? (isRightSide ? "0 0.5rem 0.5rem 0" : "0.5rem 0 0 0.5rem") : "0.5rem" }}
            >
              {book.cover ? (
                <img src={book.cover} alt={book.title} className="w-full h-full object-cover" loading="lazy" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <BookOpen className="w-12 h-12 text-white/50" />
                </div>
              )}
              <div
                className="absolute inset-0 pointer-events-none transition-opacity duration-300"
                style={{
                  opacity: isExpanded ? 1 : 0,
                  background: isRightSide
                    ? "linear-gradient(to left, hsl(var(--card)) 0%, hsl(var(--card) / 0.8) 15%, transparent 50%)"
                    : "linear-gradient(to right, hsl(var(--card)) 0%, hsl(var(--card) / 0.8) 15%, transparent 50%)",
                }}
              />
            </div>
          </div>

          <div className="flex-shrink-0 overflow-hidden transition-all duration-300 ease-out" style={{ width: isExpanded ? detailsPanelWidth : 0, opacity: isExpanded ? 1 : 0 }}>
            <div
              className="h-full bg-card shadow-2xl"
              style={{
                width: detailsPanelWidth,
                borderRadius: isRightSide ? "0.5rem 0 0 0.5rem" : "0 0.5rem 0.5rem 0",
                marginLeft: isRightSide ? 0 : -12,
                marginRight: isRightSide ? -12 : 0,
                boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
              }}
            >
              <div className="h-full p-4 flex flex-col justify-between" style={{ paddingLeft: isRightSide ? 16 : 24, paddingRight: isRightSide ? 24 : 16 }}>
                <div className="space-y-2">
                  <div>
                    <h3 className="font-semibold text-foreground line-clamp-2 leading-tight">{book.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{book.author}</p>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      ~4h
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      1890
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground line-clamp-3">Klasyczne dzieło polskiej literatury, opowiadające historię miłości i przemian społecznych.</p>

                  <div className="flex flex-wrap gap-1">
                    {book.epoch && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {book.epoch}
                      </Badge>
                    )}
                    {book.genre && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {book.genre}
                      </Badge>
                    )}
                    {book.kind && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {book.kind}
                      </Badge>
                    )}
                  </div>
                </div>

                <Button className="w-full gap-2 mt-3" size="sm" onClick={handleStartClick}>
                  <Play className="w-4 h-4 fill-current" />
                  Start Reading
                </Button>
              </div>
            </div>
          </div>
        </div>

        <h3 className={`text-sm font-medium line-clamp-2 transition-opacity duration-300 ${isExpanded ? "opacity-0" : "opacity-100"}`}>{book.title}</h3>
        <p className={`text-xs text-muted-foreground line-clamp-1 transition-opacity duration-300 ${isExpanded ? "opacity-0" : "opacity-100"}`}>{book.author}</p>
      </div>
    </div>
  );
}

export function CollectionsPage({ onSelectBook, onBack }: CollectionsPageProps) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [collectionDetails, setCollectionDetails] = useState<CollectionDetails | null>(null);
  const [isLoadingCollections, setIsLoadingCollections] = useState(true);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [gridColumns, setGridColumns] = useState(6);

  useEffect(() => {
    const updateColumns = () => {
      const width = window.innerWidth;
      if (width >= 1280) setGridColumns(6);
      else if (width >= 1024) setGridColumns(5);
      else if (width >= 768) setGridColumns(4);
      else if (width >= 640) setGridColumns(3);
      else setGridColumns(2);
    };
    updateColumns();
    window.addEventListener("resize", updateColumns);
    return () => window.removeEventListener("resize", updateColumns);
  }, []);

  useEffect(() => {
    const loadCollections = async () => {
      try {
        const data = await trpc.getWolneLekturyCollections.query();
        setCollections(data);
      } catch (e) {
        console.error("Failed to load collections:", e);
      } finally {
        setIsLoadingCollections(false);
      }
    };
    loadCollections();
  }, []);

  const loadCollection = useCallback(async (slug: string) => {
    setSelectedCollection(slug);
    setIsLoadingDetails(true);
    try {
      const data = await trpc.getWolneLekturyCollection.query({ slug });
      setCollectionDetails(data);
    } catch (e) {
      console.error("Failed to load collection:", e);
    } finally {
      setIsLoadingDetails(false);
    }
  }, []);

  const handleBookSelect = useCallback(
    async (bookSlug: string) => {
      setIsDownloading(true);
      try {
        onSelectBook(bookSlug);
      } finally {
        setIsDownloading(false);
      }
    },
    [onSelectBook],
  );

  const goBackToCollections = useCallback(() => {
    setSelectedCollection(null);
    setCollectionDetails(null);
  }, []);

  if (isLoadingCollections) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isDownloading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Downloading and preparing book...</p>
      </div>
    );
  }

  if (selectedCollection && collectionDetails) {
    return (
      <div className="space-y-6 overflow-visible">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={goBackToCollections} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Collections
          </Button>
          <div>
            <h2 className="text-xl font-semibold">{collectionDetails.title || selectedCollection}</h2>
            <p className="text-sm text-muted-foreground">{collectionDetails.books.length} books</p>
          </div>
        </div>

        {isLoadingDetails ? (
          <div className="flex items-center justify-center min-h-[300px]">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-4 gap-y-8 pb-32 overflow-visible">
            {collectionDetails.books.map((book, index) => (
              <BookCard key={book.slug} book={book} onSelect={handleBookSelect} index={index} totalColumns={gridColumns} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Library className="w-5 h-5 text-primary" />
            Collections
          </h2>
          <p className="text-sm text-muted-foreground">Browse curated book collections from Wolne Lektury</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back to Pipeline
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {collections.map((collection) => (
          <Card key={collection.slug} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => loadCollection(collection.slug)}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base line-clamp-2">{collection.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-xs">Click to browse books</CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
