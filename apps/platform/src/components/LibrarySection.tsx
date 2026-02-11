import { useState, useEffect, useCallback, useRef, useLayoutEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Loader2, BookOpen, Search, X, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  BookCard,
  type CollectionBook,
} from "@platform/components/standard-ebooks/StandardEbooksBookCard";
import { BookModal } from "@platform/components/standard-ebooks/StandardEbooksBookModal";
import { useRouteTransition } from "@platform/providers/RouteTransitionProvider";
import { SPLASH_FADE_DURATION_MS } from "@player/components/SplashScreen";
import { useAvailableBooks } from "@platform/hooks/useAvailableBooks";
import { toast } from "sonner";

type BookMeta = { t: string; a: string; w: number; c?: string };

const SE_COVER_CDN = "https://odyssey-cdn.lgandecki.net/bookgenius";
type Descriptions = Record<string, { description: string; hook: string }>;

const LIBRARY_CARD_WIDTH = 275;
const LIBRARY_CARD_GAP = 20;
const LIBRARY_CARD_SLOT = LIBRARY_CARD_WIDTH + LIBRARY_CARD_GAP;
const LIBRARY_OVERSCAN = 4;

const CATEGORY_ORDER = [
  { id: "most-popular", label: "Most Popular" },
  { id: "page-turners", label: "Page-Turners" },
  { id: "quick-reads", label: "Quick Reads" },
  { id: "epic-reads", label: "Epic Reads" },
  { id: "detective-mystery", label: "Detective & Mystery" },
  { id: "science-fiction", label: "Science Fiction" },
  { id: "horror-gothic", label: "Horror & Gothic" },
  { id: "adventure", label: "Adventure" },
  { id: "romance", label: "Romance" },
  { id: "comedy-satire", label: "Comedy & Satire" },
  { id: "childrens", label: "Children's" },
  { id: "fantasy", label: "Fantasy" },
  { id: "historical-fiction", label: "Historical Fiction" },
  { id: "psychological-fiction", label: "Psychological Fiction" },
  { id: "philosophy-ideas", label: "Philosophy & Ideas" },
  { id: "memoir-biography", label: "Memoir & Biography" },
  { id: "poetry", label: "Poetry" },
  { id: "social-justice-reform", label: "Social Justice & Reform" },
  { id: "war-literature", label: "War Literature" },
  { id: "exploration-lost-worlds", label: "Exploration & Lost Worlds" },
  { id: "dystopia-utopia", label: "Dystopia & Utopia" },
  { id: "russian-literature", label: "Russian Literature" },
  { id: "french-literature", label: "French Literature" },
  { id: "nautical-adventures", label: "Nautical Adventures" },
] as const;

function formatReadingTime(wordCount: number): string {
  const minutes = Math.ceil(wordCount / 250);
  if (minutes < 60) return "~1 hr";
  const hours = Math.round(minutes / 60);
  return `~${hours} hrs`;
}

function slugToCollectionBook(
  slug: string,
  meta: BookMeta,
  desc?: { description: string; hook: string },
): CollectionBook {
  return {
    title: meta.t,
    author: meta.a,
    slug,
    cover: meta.c ? `${SE_COVER_CDN}/${meta.c}/${slug}.jpg` : "",
    coverThumb: meta.c ? `${SE_COVER_CDN}/${meta.c}/${slug}.jpg` : "",
    coverColor: "#2a2a3d",
    epoch: "",
    genre: "",
    kind: "",
    hasAudio: false,
    generatedDescription: desc?.description || "",
    generatedHook: desc?.hook || "",
    readingTime: formatReadingTime(meta.w),
  };
}

function CategoryRow({
  label,
  slugs,
  bookMeta,
  descriptions,
  availableBooks,
  onSelectBook,
  onOpenModal,
}: {
  label: string;
  slugs: string[];
  bookMeta: Record<string, BookMeta>;
  descriptions: Descriptions | null;
  availableBooks: Set<string> | undefined;
  onSelectBook: (slug: string) => void;
  onOpenModal: (book: CollectionBook) => void;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);
  const scrollPosRef = useRef<number>(0);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [virtualRange, setVirtualRange] = useState({ start: 0, end: Math.min(slugs.length, 12) });

  const updateScrollState = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setCanScrollLeft(scrollLeft > 1);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);

    const start = Math.max(0, Math.floor(scrollLeft / LIBRARY_CARD_SLOT) - LIBRARY_OVERSCAN);
    const end = Math.max(
      start,
      Math.min(
        slugs.length,
        Math.ceil((scrollLeft + clientWidth) / LIBRARY_CARD_SLOT) + LIBRARY_OVERSCAN,
      ),
    );
    setVirtualRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, [slugs.length]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        } else {
          if (scrollRef.current) {
            scrollPosRef.current = scrollRef.current.scrollLeft;
          }
          setIsVisible(false);
        }
      },
      { rootMargin: "600px" },
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (!isVisible || !scrollRef.current) return;
    if (scrollPosRef.current > 0) {
      scrollRef.current.scrollLeft = scrollPosRef.current;
    }
    updateScrollState();
  }, [isVisible, slugs, updateScrollState]);

  useEffect(() => {
    if (!isVisible) return;
    updateScrollState();
    window.addEventListener("resize", updateScrollState);
    return () => window.removeEventListener("resize", updateScrollState);
  }, [slugs.length, isVisible, updateScrollState]);

  useEffect(
    () => () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
      }
    },
    [],
  );

  const handleScroll = useCallback(() => {
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      updateScrollState();
    });
  }, [updateScrollState]);

  const scrollByAmount = useCallback((direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const offset = Math.max(scrollRef.current.clientWidth * 0.75, 320);
    scrollRef.current.scrollBy({
      left: direction === "left" ? -offset : offset,
      behavior: "smooth",
    });
  }, []);

  const collectionBooks = useMemo(
    () =>
      slugs
        .filter((s) => bookMeta[s])
        .map((s) => slugToCollectionBook(s, bookMeta[s], descriptions?.[s])),
    [slugs, bookMeta, descriptions],
  );

  const visibleBooks = useMemo(
    () => collectionBooks.slice(virtualRange.start, virtualRange.end),
    [collectionBooks, virtualRange.end, virtualRange.start],
  );
  const leftSpacerWidth = virtualRange.start * LIBRARY_CARD_SLOT;
  const trailingCount = collectionBooks.length - virtualRange.end;
  const rightSpacerWidth =
    trailingCount > 0
      ? trailingCount * LIBRARY_CARD_WIDTH + Math.max(0, trailingCount - 1) * LIBRARY_CARD_GAP
      : 0;

  if (!isVisible) {
    return <div ref={containerRef} className="h-[520px] w-full" />;
  }

  return (
    <div ref={containerRef} className="mb-10 space-y-5 min-h-[460px]">
      <div className="flex items-center justify-between px-8 md:px-12 lg:px-20 group">
        <h3 className="text-3xl font-bold text-foreground">{label}</h3>
        <span className="text-muted-foreground">{slugs.length} books</span>
      </div>

      <div className="relative group/carousel">
        {canScrollLeft && (
          <button
            type="button"
            aria-label="Previous books"
            onClick={() => scrollByAmount("left")}
            className="hidden md:flex pointer-events-none group-hover/carousel:pointer-events-auto absolute left-0 top-0 bottom-0 z-[90] w-16 items-center justify-center bg-gradient-to-r from-black/80 via-black/45 to-transparent text-white opacity-0 transition-opacity duration-200 group-hover/carousel:opacity-100 hover:from-black/90 hover:via-black/55"
          >
            <ChevronLeft className="h-10 w-10" />
          </button>
        )}

        {canScrollRight && (
          <button
            type="button"
            aria-label="Next books"
            onClick={() => scrollByAmount("right")}
            className="hidden md:flex pointer-events-none group-hover/carousel:pointer-events-auto absolute right-0 top-0 bottom-0 z-[90] w-16 items-center justify-center bg-gradient-to-l from-black/80 via-black/45 to-transparent text-white opacity-0 transition-opacity duration-200 group-hover/carousel:opacity-100 hover:from-black/90 hover:via-black/55"
          >
            <ChevronRight className="h-10 w-10" />
          </button>
        )}

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex overflow-x-auto pb-10 pt-5 pl-8 md:pl-12 lg:pl-20 hide-scrollbar"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {leftSpacerWidth > 0 && (
            <div aria-hidden className="shrink-0" style={{ width: leftSpacerWidth }} />
          )}

          {visibleBooks.map((book, localIndex) => {
            const globalIndex = virtualRange.start + localIndex;
            return (
              <div
                key={book.slug}
                className={`flex-shrink-0 w-[275px] book-card-enter stagger-${Math.min(globalIndex + 1, 12)} hover:!z-50`}
                style={{
                  marginRight: globalIndex < collectionBooks.length - 1 ? LIBRARY_CARD_GAP : 0,
                }}
              >
                <BookCard
                  book={book}
                  onSelect={onSelectBook}
                  onOpenModal={onOpenModal}
                  unavailable={availableBooks ? !availableBooks.has(book.slug) : false}
                />
              </div>
            );
          })}

          {rightSpacerWidth > 0 && (
            <div aria-hidden className="shrink-0" style={{ width: rightSpacerWidth }} />
          )}
        </div>
      </div>
    </div>
  );
}

interface LibrarySectionProps {
  searchQuery?: string;
}

export default function LibrarySection({ searchQuery = "" }: LibrarySectionProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { startTransition, setNavigatedFromPlatform } = useRouteTransition();
  const [categories, setCategories] = useState<Record<string, string[]> | null>(null);
  const [bookMeta, setBookMeta] = useState<Record<string, BookMeta> | null>(null);
  const [descriptions, setDescriptions] = useState<Descriptions | null>(null);
  const [modalBook, setModalBook] = useState<CollectionBook | null>(null);
  const [localSearch, setLocalSearch] = useState("");
  const availableBooks = useAvailableBooks();

  useEffect(() => {
    Promise.all([
      import("../../../pipeline/standardebooks-data/categories.json"),
      import("../../../pipeline/standardebooks-data/book-meta.json"),
    ]).then(([cats, meta]) => {
      setCategories(cats.default as Record<string, string[]>);
      setBookMeta(meta.default as Record<string, BookMeta>);
    });

    import("../../../pipeline/standardebooks-data/descriptions.json").then((d) => {
      setDescriptions(d.default as Descriptions);
    });
  }, []);

  const isLoading = !categories || !bookMeta;
  const totalBooks = bookMeta ? Object.keys(bookMeta).length : 0;

  const effectiveQuery = searchQuery.trim() || localSearch.trim();
  const normalizedQuery = effectiveQuery.toLowerCase();

  const handleBookSelect = useCallback(
    (slug: string) => {
      if (availableBooks && !availableBooks.has(slug)) {
        toast("This book is being processed. Expected availability: end of February.");
        return;
      }

      const meta = bookMeta?.[slug];
      const desc = descriptions?.[slug];
      const title = meta?.t ?? "BookGenius";
      const author = meta?.a ?? "";
      const phrases = desc?.hook ? [desc.hook] : [];

      setNavigatedFromPlatform(true);
      startTransition({ title, phrases, author, showStartButton: false });

      setTimeout(() => {
        navigate(`/reader?book=${encodeURIComponent(slug)}`, {
          state: { meta: { title, phrases, author } },
        });
      }, SPLASH_FADE_DURATION_MS);
    },
    [availableBooks, bookMeta, descriptions, navigate, setNavigatedFromPlatform, startTransition],
  );

  const handleOpenModal = useCallback((book: CollectionBook) => {
    setModalBook(book);
  }, []);

  const handleCloseModal = useCallback(() => {
    setModalBook(null);
  }, []);

  // Search: find matching slugs across all books
  const searchResults = useMemo(() => {
    if (!normalizedQuery || !bookMeta) return null;
    return Object.entries(bookMeta)
      .filter(([, meta]) => {
        const haystack = `${meta.t} ${meta.a}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      })
      .map(([slug]) => slug);
  }, [normalizedQuery, bookMeta]);

  const visibleCount = searchResults ? searchResults.length : totalBooks;

  // Redistribute overlapping leading books so adjacent categories don't start identically
  const displayCategories = useMemo(() => {
    if (!categories) return null;
    const result = { ...categories };

    const mostPopularLeads = new Set((result["most-popular"] ?? []).slice(0, 6));
    const pageTurners = result["page-turners"];

    if (pageTurners) {
      const overlapping: string[] = [];
      const rest: string[] = [];
      for (const slug of pageTurners) {
        if (mostPopularLeads.has(slug)) overlapping.push(slug);
        else rest.push(slug);
      }
      if (overlapping.length > 0) {
        const merged = [...rest];
        for (const slug of overlapping) {
          const minPos = Math.min(6, merged.length);
          const pos = minPos + Math.floor(Math.random() * (merged.length - minPos + 1));
          merged.splice(pos, 0, slug);
        }
        result["page-turners"] = merged;
      }
    }

    return result;
  }, [categories]);

  // Which categories to show
  const visibleCategories = useMemo(() => {
    if (searchResults) return null; // show flat search results instead
    return CATEGORY_ORDER.filter((cat) => displayCategories?.[cat.id]?.length);
  }, [searchResults, displayCategories]);

  return (
    <section id="library" className="pt-16 pb-24">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between px-8 md:px-12 lg:px-20 mb-10 gap-4">
        <div>
          <h2 className="text-4xl font-bold text-foreground flex items-center gap-3">
            <BookOpen className="w-10 h-10 text-library-gold" />
            {t("library.browseThe", "Browse the")}{" "}
            <span className="text-library-gold">{t("library.libraryWord", "Library")}</span>
          </h2>
          <p className="text-lg text-muted-foreground mt-2">
            {isLoading
              ? t("common.loading", "Loading...")
              : `${visibleCount.toLocaleString()} ${t("library.description", "classic books with character tracking and spoiler-free Q&A")}`}
          </p>
        </div>
      </div>

      <div className="px-8 md:px-12 lg:px-20 mb-10">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-2xl">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery || localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder={t("library.searchPlaceholder", "Search by title, author, or subject...")}
              className="w-full pl-10 pr-10 py-2 rounded-md bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              readOnly={!!searchQuery}
            />
            {(searchQuery || localSearch.trim()) && !searchQuery && (
              <button
                type="button"
                onClick={() => setLocalSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted"
                aria-label="Clear search"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </div>
          <div className="text-sm text-muted-foreground">
            {normalizedQuery
              ? `Showing ${visibleCount} of ${totalBooks} books`
              : isLoading
                ? ""
                : `${totalBooks.toLocaleString()} books`}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </div>
      ) : (
        <div className="flex flex-col">
          {searchResults ? (
            searchResults.length === 0 ? (
              <div className="px-8 md:px-12 lg:px-20 py-10 text-muted-foreground">
                {t("library.noResults", "No books match your search.")}
              </div>
            ) : (
              <CategoryRow
                label={`Search Results`}
                slugs={searchResults}
                bookMeta={bookMeta!}
                descriptions={descriptions}
                availableBooks={availableBooks}
                onSelectBook={handleBookSelect}
                onOpenModal={handleOpenModal}
              />
            )
          ) : (
            visibleCategories?.map((cat, idx) => (
              <div key={cat.id} className={`animate-fade-in stagger-${Math.min(idx + 1, 6)}`}>
                <CategoryRow
                  label={cat.label}
                  slugs={displayCategories![cat.id]}
                  bookMeta={bookMeta!}
                  descriptions={descriptions}
                  availableBooks={availableBooks}
                  onSelectBook={handleBookSelect}
                  onOpenModal={handleOpenModal}
                />
              </div>
            ))
          )}
        </div>
      )}

      {createPortal(
        <BookModal book={modalBook} onClose={handleCloseModal} onSelect={handleBookSelect} />,
        document.body,
      )}
    </section>
  );
}
