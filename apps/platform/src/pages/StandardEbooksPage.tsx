import { useState, useEffect, useCallback, useRef, useLayoutEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, ArrowLeft, BookOpen, Search, X } from "lucide-react";
import { Button } from "@platform/components/ui/button";
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
  const scrollPosRef = useRef<number>(0);

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
    if (isVisible && scrollRef.current && scrollPosRef.current > 0) {
      scrollRef.current.scrollLeft = scrollPosRef.current;
    }
  }, [isVisible, books]);

  if (!isVisible) {
    return <div ref={containerRef} className="h-[520px] w-full" />;
  }

  const collectionBooks = books.map(seBookToCollectionBook);

  return (
    <div ref={containerRef} className="mb-10 space-y-5 min-h-[460px]">
      <div className="flex items-center justify-between px-4 md:px-8 xl:px-48 group">
        <h3 className="text-3xl font-bold text-foreground">{letter}</h3>
        <span className="text-muted-foreground">{books.length} books</span>
      </div>

      <div className="relative group/carousel">
        <div
          ref={scrollRef}
          className="flex overflow-x-auto pb-10 pt-5 px-4 md:px-8 xl:px-16 gap-5 snap-x snap-mandatory hide-scrollbar"
          style={{
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            maskImage: "linear-gradient(to right, transparent, black 0%, black 98%, transparent)",
            WebkitMaskImage:
              "linear-gradient(to right, transparent, black 0%, black 98%, transparent)",
          }}
        >
          {collectionBooks.map((book, i) => (
            <div
              key={book.slug}
              className={`flex-shrink-0 w-[275px] snap-start book-card-enter stagger-${Math.min(i + 1, 12)} hover:!z-50`}
            >
              <BookCard
                book={book}
                index={i}
                totalColumns={6}
                onSelect={onSelectBook}
                onOpenModal={onOpenModal}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function StandardEbooksPage() {
  const navigate = useNavigate();
  const { startTransition, setNavigatedFromPlatform } = useRouteTransition();
  const [groupedBooks, setGroupedBooks] = useState<Record<string, SEBook[]>>({});
  const [allBooks, setAllBooks] = useState<SEBook[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalBooks, setTotalBooks] = useState(0);
  const [modalBook, setModalBook] = useState<CollectionBook | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  const normalizedQuery = searchQuery.trim().toLowerCase();
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
    <div className="pb-24 page-enter">
      <div className="flex items-center justify-between px-4 md:px-8 xl:px-48 mb-10">
        <div>
          <h2 className="text-4xl font-bold flex items-center gap-3">
            <BookOpen className="w-10 h-10 text-primary" />
            Standard Ebooks
          </h2>
          <p className="text-lg text-muted-foreground mt-2">
            {visibleCount} professionally formatted public domain books
          </p>
        </div>
        <Button variant="ghost" size="default" onClick={() => navigate("/")} className="gap-2">
          <ArrowLeft className="w-5 h-5" />
          Back Home
        </Button>
      </div>

      <div className="px-4 md:px-8 xl:px-48 mb-10">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-2xl">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title, author, or subject..."
              className="w-full pl-10 pr-10 py-2 rounded-md bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            {searchQuery.trim() && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
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
              : `${totalBooks} books`}
          </div>
        </div>
      </div>

      <div className="flex flex-col">
        {sortedLetters.length === 0 ? (
          <div className="px-4 md:px-8 xl:px-48 py-10 text-muted-foreground">
            No books match your search.
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

      <BookModal book={modalBook} onClose={handleCloseModal} onSelect={handleBookSelect} />
    </div>
  );
}
