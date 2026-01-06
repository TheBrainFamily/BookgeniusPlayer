import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { trpc } from "../trpc";
import { Loader2, ArrowLeft, Library, ArrowRight } from "lucide-react";
import { BookCard, CollectionBook } from "../components/BookCard";
import { BookModal } from "../components/BookModal";
import { Button } from "@/components/ui/button";

async function loadDescriptionsForCollection(
  slug: string,
): Promise<Map<string, { description: string; hook: string }>> {
  try {
    const data = await trpc.getBookDescriptions.query({ collectionSlug: slug });
    const descriptions = new Map<string, { description: string; hook: string }>();
    for (const book of data.descriptions) {
      if (book.description && book.hook) {
        descriptions.set(book.slug, { description: book.description, hook: book.hook });
      }
    }
    return descriptions;
  } catch (e) {
    console.warn(`Failed to load descriptions for collection ${slug}:`, e);
    return new Map();
  }
}

let readingTimesCache: Record<string, string> | null = null;

async function loadReadingTimes(): Promise<Record<string, string>> {
  if (readingTimesCache) return readingTimesCache;
  try {
    readingTimesCache = await trpc.getReadingTimes.query();
    return readingTimesCache;
  } catch (e) {
    console.warn("Failed to load reading times:", e);
    return {};
  }
}

type Collection = { title: string; slug: string; url: string };

type CollectionDetails = { url: string; title?: string; books: CollectionBook[] };

function CollectionRow({
  collection,
  onSelectBook,
  onOpenModal,
}: {
  collection: Collection;
  onSelectBook?: (slug: string) => void;
  onOpenModal?: (book: CollectionBook) => void;
}) {
  const [books, setBooks] = useState<CollectionBook[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollPosRef = useRef<number>(0);
  const navigate = useNavigate();

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
      { rootMargin: "600px" }, // Load 2-3 rows ahead/behind
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (isVisible && !hasFetched && !isLoading) {
      const fetchBooks = async () => {
        setIsLoading(true);
        try {
          const [data, descriptions, readingTimes] = await Promise.all([
            trpc.getWolneLekturyCollection.query({ slug: collection.slug }),
            loadDescriptionsForCollection(collection.slug),
            loadReadingTimes(),
          ]);

          const enrichedBooks = data.books.map((book) => {
            const desc = descriptions.get(book.slug);
            const readingTime = readingTimes[book.slug];
            return {
              ...book,
              ...(desc && { generatedDescription: desc.description, generatedHook: desc.hook }),
              ...(readingTime && { readingTime }),
            };
          });

          setBooks(enrichedBooks);
        } catch (e) {
          console.error(`Failed to load books for collection ${collection.slug}:`, e);
        } finally {
          setIsLoading(false);
          setHasFetched(true);
        }
      };
      fetchBooks();
    }
  }, [isVisible, hasFetched, isLoading, collection.slug]);

  useLayoutEffect(() => {
    if (isVisible && scrollRef.current && scrollPosRef.current > 0) {
      scrollRef.current.scrollLeft = scrollPosRef.current;
    }
  }, [isVisible, books]);

  // Virtualization: If not visible and already fetched, render a placeholder to keep scroll height roughly correct
  if (!isVisible && hasFetched) {
    return <div ref={containerRef} className="h-[520px] w-full" />;
  }

  return (
    <div ref={containerRef} className="mb-10 space-y-5 min-h-[460px]">
      <div className="flex items-center justify-between px-4 md:px-8 xl:px-48 group">
        <h3
          className="text-3xl font-bold text-foreground cursor-pointer hover:text-primary transition-colors"
          onClick={() => navigate(`/collections/${collection.slug}`)}
        >
          {collection.title}
        </h3>
        <Button
          variant="ghost"
          size="default"
          onClick={() => navigate(`/collections/${collection.slug}`)}
          className="gap-2 opacity-40 group-hover:opacity-100 transition-opacity"
        >
          View All <ArrowRight className="w-5 h-5" />
        </Button>
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
          {isLoading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="flex-shrink-0 w-[275px] h-[412px] bg-muted/30 rounded-xl animate-pulse snap-start"
                />
              ))
            : books.map((book, i) => (
                <div
                  key={book.slug}
                  className={`flex-shrink-0 w-[275px] snap-start book-card-enter stagger-${Math.min(i + 1, 12)} hover:!z-50`}
                >
                  <BookCard
                    book={book}
                    index={i}
                    totalColumns={6}
                    onSelect={onSelectBook || (() => {})}
                    onOpenModal={onOpenModal}
                  />
                </div>
              ))}
        </div>
      </div>
    </div>
  );
}

interface CollectionsPageProps {
  onSelectBook?: (slug: string) => void;
}

export function CollectionsPage({ onSelectBook }: CollectionsPageProps) {
  const { slug: collectionSlug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionDetails, setCollectionDetails] = useState<CollectionDetails | null>(null);
  const [isLoadingCollections, setIsLoadingCollections] = useState(true);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [gridColumns, setGridColumns] = useState(6);
  const [modalBook, setModalBook] = useState<CollectionBook | null>(null);

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
    if (collectionSlug) {
      setIsLoadingCollections(false);
      return;
    }
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
  }, [collectionSlug]);

  useEffect(() => {
    if (!collectionSlug) {
      setCollectionDetails(null);
      return;
    }
    const loadCollection = async () => {
      setIsLoadingDetails(true);
      try {
        const [data, descriptions, readingTimes] = await Promise.all([
          trpc.getWolneLekturyCollection.query({ slug: collectionSlug }),
          loadDescriptionsForCollection(collectionSlug),
          loadReadingTimes(),
        ]);

        const enrichedBooks = data.books.map((book) => {
          const desc = descriptions.get(book.slug);
          const readingTime = readingTimes[book.slug];
          return {
            ...book,
            ...(desc && { generatedDescription: desc.description, generatedHook: desc.hook }),
            ...(readingTime && { readingTime }),
          };
        });

        setCollectionDetails({ ...data, books: enrichedBooks });
      } catch (e) {
        console.error("Failed to load collection:", e);
      } finally {
        setIsLoadingDetails(false);
      }
    };
    loadCollection();
  }, [collectionSlug]);

  const handleBookSelect = useCallback(
    async (bookSlug: string) => {
      if (onSelectBook) {
        setIsDownloading(true);
        try {
          onSelectBook(bookSlug);
        } finally {
          setIsDownloading(false);
        }
      } else {
        navigate(`/?book=${encodeURIComponent(bookSlug)}`);
      }
    },
    [onSelectBook, navigate],
  );

  const handleOpenModal = useCallback((book: CollectionBook) => {
    setModalBook(book);
  }, []);

  const handleCloseModal = useCallback(() => {
    setModalBook(null);
  }, []);

  if (isLoadingCollections) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (isDownloading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] gap-5">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-lg text-muted-foreground">Downloading and preparing book...</p>
      </div>
    );
  }

  if (collectionSlug && collectionDetails) {
    return (
      <div className="space-y-10 overflow-visible pb-24 page-enter">
        <div className="flex items-center gap-5">
          <Button
            variant="ghost"
            size="default"
            onClick={() => navigate("/collections")}
            className="gap-2"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Collections
          </Button>
          <div>
            <h2 className="text-3xl font-bold">{collectionDetails.title || collectionSlug}</h2>
            <p className="text-lg text-muted-foreground">{collectionDetails.books.length} books</p>
          </div>
        </div>

        {isLoadingDetails ? (
          <div className="flex items-center justify-center min-h-[500px]">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
          </div>
        ) : (
          <div
            className="grid gap-5 overflow-visible page-enter"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}
          >
            {collectionDetails.books.map((book, index) => (
              <div
                key={book.slug}
                className={`book-card-enter stagger-${Math.min((index % 12) + 1, 12)} hover:!z-50`}
              >
                <BookCard
                  book={book}
                  onSelect={handleBookSelect}
                  onOpenModal={handleOpenModal}
                  index={index}
                  totalColumns={6}
                />
              </div>
            ))}
          </div>
        )}
        <BookModal book={modalBook} onClose={handleCloseModal} onSelect={handleBookSelect} />
      </div>
    );
  }

  if (collectionSlug && isLoadingDetails) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="pb-24 page-enter">
      <div className="flex items-center justify-between px-4 md:px-8 xl:px-48 mb-10">
        <div>
          <h2 className="text-4xl font-bold flex items-center gap-3">
            <Library className="w-10 h-10 text-primary" />
            Collections
          </h2>
          <p className="text-lg text-muted-foreground mt-2">
            Browse curated book collections from Wolne Lektury
          </p>
        </div>
        <Button variant="ghost" size="default" onClick={() => navigate("/")} className="gap-2">
          <ArrowLeft className="w-5 h-5" />
          Back to Pipeline
        </Button>
      </div>

      <div className="flex flex-col">
        {collections.map((collection, idx) => (
          <div key={collection.slug} className={`animate-fade-in stagger-${Math.min(idx + 1, 6)}`}>
            <CollectionRow
              collection={collection}
              onSelectBook={handleBookSelect}
              onOpenModal={handleOpenModal}
            />
          </div>
        ))}
      </div>
      <BookModal book={modalBook} onClose={handleCloseModal} onSelect={handleBookSelect} />
    </div>
  );
}
