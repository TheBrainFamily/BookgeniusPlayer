import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import { useNavigate } from "react-router-dom";
import { trpc } from "../trpc";
import { Loader2, ArrowLeft, BookOpen } from "lucide-react";
import { BookCard, CollectionBook } from "../components/BookCard";
import { BookModal } from "../components/BookModal";
import { Button } from "@/components/ui/button";

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
            WebkitMaskImage: "linear-gradient(to right, transparent, black 0%, black 98%, transparent)",
          }}
        >
          {collectionBooks.map((book, i) => (
            <div key={book.slug} className={`flex-shrink-0 w-[275px] snap-start book-card-enter stagger-${Math.min(i + 1, 12)} hover:!z-50`}>
              <BookCard book={book} index={i} totalColumns={6} onSelect={onSelectBook} onOpenModal={onOpenModal} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function StandardEbooksPage() {
  const navigate = useNavigate();
  const [groupedBooks, setGroupedBooks] = useState<Record<string, SEBook[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [totalBooks, setTotalBooks] = useState(0);
  const [modalBook, setModalBook] = useState<CollectionBook | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await trpc.getStandardEbooksIndex.query();
        setGroupedBooks(data.groupedByAuthorLetter);
        setTotalBooks(data.books.length);
      } catch (e) {
        console.error("Failed to load Standard Ebooks index:", e);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  const handleBookSelect = useCallback(
    (slug: string) => {
      navigate(`/?se-book=${encodeURIComponent(slug)}`);
    },
    [navigate],
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

  const sortedLetters = Object.keys(groupedBooks).sort();

  return (
    <div className="pb-24 page-enter">
      <div className="flex items-center justify-between px-4 md:px-8 xl:px-48 mb-10">
        <div>
          <h2 className="text-4xl font-bold flex items-center gap-3">
            <BookOpen className="w-10 h-10 text-primary" />
            Standard Ebooks
          </h2>
          <p className="text-lg text-muted-foreground mt-2">{totalBooks} professionally formatted public domain books</p>
        </div>
        <Button variant="ghost" size="default" onClick={() => navigate("/")} className="gap-2">
          <ArrowLeft className="w-5 h-5" />
          Back to Pipeline
        </Button>
      </div>

      <div className="flex flex-col">
        {sortedLetters.map((letter, idx) => (
          <div key={letter} className={`animate-fade-in stagger-${Math.min(idx + 1, 6)}`}>
            <AuthorLetterRow letter={letter} books={groupedBooks[letter]} onSelectBook={handleBookSelect} onOpenModal={handleOpenModal} />
          </div>
        ))}
      </div>

      <BookModal book={modalBook} onClose={handleCloseModal} onSelect={handleBookSelect} />
    </div>
  );
}
