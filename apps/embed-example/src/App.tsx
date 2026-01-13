import React, { useState, useEffect, Suspense, useRef } from "react";
import { SplashScreen } from "@player/components/SplashScreen";

// Lazy load the player - this is what we'd prefetch
const BookGeniusPlayer = React.lazy(() => import("./PlayerWrapper"));

// Hardcoded book data - includes loading phrases for splash screen
const books = [
  {
    slug: "Othello",
    title: "Othello",
    author: "William Shakespeare",
    loadingPhrases: [
      "Preparing the stage...",
      "Summoning the Moor...",
      "Setting the scene in Venice...",
    ],
  },
  {
    slug: "Lalka",
    title: "Lalka",
    author: "Bolesław Prus",
    loadingPhrases: [
      "Przygotowuję scenę...",
      "Wczytywanie postaci...",
      "Warszawa XIX wieku ożywa...",
    ],
  },
];

type SelectedBook = (typeof books)[number] | null;

export function App() {
  const [selectedBook, setSelectedBook] = useState<SelectedBook>(null);
  const [isPrefetched, setIsPrefetched] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);
  const [splashLoaded, setSplashLoaded] = useState(false);
  const fadeInCompleteRef = useRef(false);

  // Prefetch player on page load
  useEffect(() => {
    import("./PlayerWrapper").then(() => {
      setIsPrefetched(true);
      console.log("Player prefetched");
    });
  }, []);

  // When a book is selected, wait for splash fade-in before showing player
  useEffect(() => {
    if (selectedBook && !fadeInCompleteRef.current) {
      // Wait for splash screen fade-in to complete before loading player
      const timer = setTimeout(() => {
        fadeInCompleteRef.current = true;
        setShowPlayer(true);
      }, 1000); // Match the 1s fade-in duration
      return () => clearTimeout(timer);
    }
  }, [selectedBook]);

  // Reset state when deselecting book
  useEffect(() => {
    if (!selectedBook) {
      setShowPlayer(false);
      setSplashLoaded(false);
      fadeInCompleteRef.current = false;
    }
  }, [selectedBook]);

  const handleBookClick = (book: (typeof books)[number]) => {
    setSelectedBook(book);
  };

  // Show splash screen when book is selected
  if (selectedBook) {
    return (
      <>
        {/* Splash screen fades in immediately */}
        <SplashScreen
          book={{
            title: selectedBook.title,
            author: selectedBook.author,
            loadingPhrases: selectedBook.loadingPhrases,
          }}
          autoStart={false}
          isLoaded={splashLoaded}
          fadeIn
        />

        {/* Player loads after splash fade-in completes */}
        {showPlayer && (
          <Suspense fallback={null}>
            <BookGeniusPlayer bookSlug={selectedBook.slug} onReady={() => setSplashLoaded(true)} />
          </Suspense>
        )}
      </>
    );
  }

  return (
    <div style={{ padding: 32 }}>
      <h1 style={{ marginBottom: 8 }}>BookGenius Library</h1>
      <p style={{ color: "#888", marginBottom: 32 }}>
        Player prefetched: {isPrefetched ? "✓" : "loading..."}
      </p>

      <div style={{ display: "flex", gap: 24 }}>
        {books.map((book) => (
          <button
            key={book.slug}
            onClick={() => handleBookClick(book)}
            style={{
              padding: 24,
              background: "linear-gradient(135deg, #2d2d2d, #1a1a1a)",
              border: "1px solid #444",
              borderRadius: 8,
              color: "white",
              cursor: "pointer",
              textAlign: "left",
              width: 200,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: "bold", marginBottom: 8 }}>{book.title}</div>
            <div style={{ fontSize: 14, color: "#888" }}>{book.author}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
