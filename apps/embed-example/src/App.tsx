import React, { useState, useEffect, Suspense } from "react";

// Lazy load the player - this is what we'd prefetch
const BookGeniusPlayer = React.lazy(() => import("./PlayerWrapper"));

// Hardcoded book data
const books = [
  { slug: "Othello", title: "Othello", author: "William Shakespeare" },
  { slug: "Lalka", title: "Lalka", author: "Bolesław Prus" },
];

export function App() {
  const [selectedBook, setSelectedBook] = useState<string | null>(null);
  const [isPrefetched, setIsPrefetched] = useState(false);

  // Prefetch player on page load
  useEffect(() => {
    // Start prefetching the player chunk
    import("./PlayerWrapper").then(() => {
      setIsPrefetched(true);
      console.log("Player prefetched");
    });
  }, []);

  if (selectedBook) {
    // Player takes over full screen - no host app UI should be visible
    return (
      <Suspense fallback={<LoadingFallback />}>
        <BookGeniusPlayer bookSlug={selectedBook} />
      </Suspense>
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
            onClick={() => setSelectedBook(book.slug)}
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

function LoadingFallback() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        background: "linear-gradient(135deg, #1a1a1a, #2d2d2d)",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 24, marginBottom: 16 }}>Loading Player...</div>
        <div style={{ color: "#888" }}>This is the embed-example fallback</div>
      </div>
    </div>
  );
}
