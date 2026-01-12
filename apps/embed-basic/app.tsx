/**
 * Basic Bun Example - No Tailwind, No Vite
 *
 * This demonstrates the minimal setup needed to embed the BookGenius player.
 * Uses Bun's native HTML dev server with TypeScript/JSX support.
 *
 * Note: A process.env polyfill is added in index.html for packages
 * that expect a Node.js environment.
 */

import { createRoot } from "react-dom/client";
import { useState, Suspense, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ConvexProvider, ConvexReactClient } from "convex/react";

// Import player components from the pre-built library (not source!)
// Source files use Vite-specific features that don't work with Bun's bundler
import {
  NativeShellProvider,
  PlayerDOMProvider,
  LiveModeAppCore,
} from "../player/dist-lib/index.js";

// Import pre-built player CSS (includes all Tailwind classes + custom styles)
import "../player/dist-lib/styles.css";

// Convex setup
// For basic example, hardcode the URL (in production, use build-time env vars)
const convexUrl = "https://limitless-manatee-952.convex.cloud";
const convex = new ConvexReactClient(convexUrl);

// Book catalog
const books = [
  { slug: "Othello", title: "Othello", author: "William Shakespeare" },
  { slug: "Lalka", title: "Lalka", author: "Boleslaw Prus" },
];

// Player wrapper component
function PlayerWrapper({ bookSlug }: { bookSlug: string }) {
  const bookPath = `books/${bookSlug}`;
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const finishedRef = useRef(false);

  const safeFinish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    console.log("[PlayerWrapper] App is ready");
    window.setTimeout(() => {
      console.log("[PlayerWrapper] Dispatching splashHidden");
      window.dispatchEvent(new CustomEvent("splashHidden"));
    }, 1000);
  }, []);

  // Listen for appReady event
  useEffect(() => {
    const onReady = () => {
      console.log("[PlayerWrapper] appReady received");
      setIsPlayerReady(true);
      safeFinish();
    };
    window.addEventListener("appReady", onReady);
    return () => window.removeEventListener("appReady", onReady);
  }, [safeFinish]);

  // Manage #player-scope visibility
  useEffect(() => {
    const playerScopeElement = document.getElementById("player-scope");
    if (!playerScopeElement) return;

    if (isPlayerReady) {
      playerScopeElement.classList.add("visible");
      playerScopeElement.removeAttribute("inert");
      playerScopeElement.setAttribute("aria-hidden", "false");
    } else {
      playerScopeElement.classList.remove("visible");
      playerScopeElement.setAttribute("inert", "");
      playerScopeElement.setAttribute("aria-hidden", "true");
    }

    return () => {
      playerScopeElement.classList.remove("visible");
      playerScopeElement.setAttribute("inert", "");
      playerScopeElement.setAttribute("aria-hidden", "true");
    };
  }, [isPlayerReady]);

  // Reset state when book changes
  useEffect(() => {
    finishedRef.current = false;
    setIsPlayerReady(false);
  }, [bookSlug]);

  // Find portal target after PlayerDOMProvider creates it
  useEffect(() => {
    const checkForTarget = () => {
      const target = document.getElementById("root-player");
      if (target) setPortalTarget(target);
    };
    checkForTarget();
    const interval = setInterval(checkForTarget, 50);
    const timeout = setTimeout(() => clearInterval(interval), 500);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, []);

  return (
    <NativeShellProvider>
      <PlayerDOMProvider>
        <ConvexProvider client={convex}>
          {portalTarget
            ? createPortal(<LiveModeAppCore bookPath={bookPath} />, portalTarget)
            : null}
        </ConvexProvider>
      </PlayerDOMProvider>
    </NativeShellProvider>
  );
}

// Main App component
function App() {
  const [selectedBook, setSelectedBook] = useState<string | null>(null);

  if (selectedBook) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <PlayerWrapper bookSlug={selectedBook} />
      </Suspense>
    );
  }

  return (
    <div style={{ padding: 32 }}>
      <h1 style={{ marginBottom: 8 }}>BookGenius - Basic Bun Example</h1>
      <p style={{ color: "#888", marginBottom: 32 }}>
        No Tailwind, No Vite - just Bun's native HTML dev server
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

function LoadingScreen() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        background: "#1a1a1a",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 24, marginBottom: 16 }}>Loading Player...</div>
      </div>
    </div>
  );
}

// Mount the app
const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}
