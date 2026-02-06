import { useState, useEffect, useCallback, useRef, useLayoutEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Loader2, BookOpen, Search, X, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { standardEbooksTrpc } from "@platform/lib/standardEbooksTrpc";
import {
  BookCard,
  type CollectionBook,
} from "@platform/components/standard-ebooks/StandardEbooksBookCard";
import { BookModal } from "@platform/components/standard-ebooks/StandardEbooksBookModal";
import { useRouteTransition } from "@platform/providers/RouteTransitionProvider";
import { SPLASH_FADE_DURATION_MS } from "@player/components/SplashScreen";

type SEBook = {
  slug: string;
  title: string;
  author: string;
  authorFileAs: string;
  description: string;
  wordCount: number;
  language: string;
  subjects: string[];
  generatedDescription?: string;
  generatedHook?: string;
};

const LIBRARY_CARD_WIDTH = 275;
const LIBRARY_CARD_GAP = 20;
const LIBRARY_CARD_SLOT = LIBRARY_CARD_WIDTH + LIBRARY_CARD_GAP;
const LIBRARY_OVERSCAN = 4;

function formatReadingTime(wordCount: number): string {
  const minutes = Math.ceil(wordCount / 250);
  if (minutes < 60) return "~1 hr";
  const hours = Math.round(minutes / 60);
  return `~${hours} hrs`;
}

function seBookToCollectionBook(book: SEBook): CollectionBook {
  return {
    title: book.title,
    author: book.author,
    slug: book.slug,
    cover: `http://localhost:4000/se-cover/${book.slug}`,
    coverThumb: `http://localhost:4000/se-cover/${book.slug}`,
    coverColor: "#2a2a3d",
    epoch: "",
    genre: book.subjects[0] || "",
    kind: "",
    hasAudio: false,
    generatedDescription: book.generatedDescription || book.description,
    generatedHook: book.generatedHook || "",
    readingTime: formatReadingTime(book.wordCount),
  };
}

function AuthorLetterRow({
  letter,
  books,
  onSelectBook,
  onOpenModal,
}: {
  letter: string;
  books: SEBook[];
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
  const [virtualRange, setVirtualRange] = useState({ start: 0, end: Math.min(books.length, 12) });

  const updateScrollState = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setCanScrollLeft(scrollLeft > 1);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);

    const start = Math.max(0, Math.floor(scrollLeft / LIBRARY_CARD_SLOT) - LIBRARY_OVERSCAN);
    const end = Math.max(
      start,
      Math.min(
        books.length,
        Math.ceil((scrollLeft + clientWidth) / LIBRARY_CARD_SLOT) + LIBRARY_OVERSCAN,
      ),
    );
    setVirtualRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, [books.length]);

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
  }, [isVisible, books, updateScrollState]);

  useEffect(() => {
    if (!isVisible) return;
    updateScrollState();
    window.addEventListener("resize", updateScrollState);
    return () => window.removeEventListener("resize", updateScrollState);
  }, [books.length, isVisible, updateScrollState]);

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

  const collectionBooks = useMemo(() => books.map(seBookToCollectionBook), [books]);
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
        <h3 className="text-3xl font-bold text-foreground">{letter}</h3>
        <span className="text-muted-foreground">{books.length} books</span>
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
                  index={globalIndex}
                  totalColumns={6}
                  onSelect={onSelectBook}
                  onOpenModal={onOpenModal}
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
  const [groupedBooks, setGroupedBooks] = useState<Record<string, SEBook[]>>({});
  const [allBooks, setAllBooks] = useState<SEBook[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalBooks, setTotalBooks] = useState(0);
  const [modalBook, setModalBook] = useState<CollectionBook | null>(null);
  const [localSearch, setLocalSearch] = useState("");

  useEffect(() => {
    const loadData = async () => {
      try {
        // @ts-expect-error - incorrect typing somehow
        const data = await standardEbooksTrpc.getStandardEbooksIndex.query();
        setGroupedBooks(data.groupedByAuthorLetter);
        setAllBooks(data.books);
        setTotalBooks(data.books.length);
      } catch (e) {
        console.error("Failed to load Standard Ebooks index:", e);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  const bookBySlug = useMemo(() => new Map(allBooks.map((book) => [book.slug, book])), [allBooks]);

  // Combine nav search and local search
  const effectiveQuery = searchQuery.trim() || localSearch.trim();
  const normalizedQuery = effectiveQuery.toLowerCase();

  const handleBookSelect = useCallback(
    (slug: string) => {
      const book = bookBySlug.get(slug);
      const title = book?.title ?? "BookGenius";
      const author = book?.author ?? "";
      const phrases = book?.generatedHook ? [book.generatedHook] : [];

      setNavigatedFromPlatform(true);
      startTransition({ title, phrases, author, showStartButton: false });

      setTimeout(() => {
        navigate(`/reader?book=${encodeURIComponent(slug)}`, {
          state: { meta: { title, phrases, author } },
        });
      }, SPLASH_FADE_DURATION_MS);
    },
    [bookBySlug, navigate, setNavigatedFromPlatform, startTransition],
  );

  const handleOpenModal = useCallback((book: CollectionBook) => {
    setModalBook(book);
  }, []);

  const handleCloseModal = useCallback(() => {
    setModalBook(null);
  }, []);

  const filteredBooks = normalizedQuery
    ? allBooks.filter((book) => {
        const haystack = [
          book.title,
          book.author,
          book.authorFileAs,
          book.description,
          book.subjects.join(" "),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalizedQuery);
      })
    : allBooks;

  const visibleGroupedBooks = normalizedQuery
    ? filteredBooks.reduce<Record<string, SEBook[]>>((acc, book) => {
        const firstLetter = (book.authorFileAs || book.author).charAt(0).toUpperCase();
        if (!acc[firstLetter]) acc[firstLetter] = [];
        acc[firstLetter].push(book);
        return acc;
      }, {})
    : groupedBooks;

  const sortedLetters = Object.keys(visibleGroupedBooks).sort();
  const visibleCount = normalizedQuery ? filteredBooks.length : totalBooks;

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
          {sortedLetters.length === 0 ? (
            <div className="px-8 md:px-12 lg:px-20 py-10 text-muted-foreground">
              {t("library.noResults", "No books match your search.")}
            </div>
          ) : (
            sortedLetters.map((letter, idx) => (
              <div key={letter} className={`animate-fade-in stagger-${Math.min(idx + 1, 6)}`}>
                <AuthorLetterRow
                  letter={letter}
                  books={visibleGroupedBooks[letter]}
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
