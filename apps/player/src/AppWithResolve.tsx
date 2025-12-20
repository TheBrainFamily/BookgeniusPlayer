import React, { useEffect, useRef, useState } from "react";
import App from "./App";
import { LiveModeApp } from "./LiveModeApp";
import { bookDataLoader } from "@player/services/bookDataLoader";
import { unloadBookColorsCSS } from "@player/utils/loadBookColors";

function getBookFromUrl(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("book");
  } catch {
    return null;
  }
}

function getTokenFromUrl(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("token");
  } catch {
    return null;
  }
}

function isLiveModeEnabled(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("live") === "true";
  } catch {
    return false;
  }
}

const AppWithResolveProd: React.FC = () => {
  const [assetBaseReady, setAssetBaseReady] = useState(false);
  const [searchKey, setSearchKey] = useState(() => window.location.search);
  const lastBookRef = useRef<string | null>(null);

  useEffect(() => {
    const onPopState = () => setSearchKey(window.location.search);
    window.addEventListener("popstate", onPopState);
    window.addEventListener("hashchange", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("hashchange", onPopState);
    };
  }, []);

  useEffect(() => {
    const book = getBookFromUrl();
    if (book === lastBookRef.current) {
      return;
    }

    lastBookRef.current = book ?? null;
    unloadBookColorsCSS();
    bookDataLoader.resetCurrentBook();
    setAssetBaseReady(false);

    if (!book) {
      bookDataLoader.setAssetBase(null);
      setAssetBaseReady(true);
      return;
    }

    bookDataLoader.setCurrentBook(book);

    let cancelled = false;
    (async () => {
      try {
        const token = getTokenFromUrl();
        const res = await fetch(`/api/core/content/resolve/${encodeURIComponent(book)}?token=${token}`, { cache: "no-store" });
        if (!res.ok) throw new Error("[RESOLVE] resolve failed");
        const { signedAssetBase, assetPrefix, assetQuery } = await res.json();

        if (cancelled) return;
        // Accept either shape; bookDataLoader parses full URL if needed
        const full = signedAssetBase ?? (assetPrefix && assetQuery ? `${assetPrefix}?${assetQuery}` : null);
        bookDataLoader.setAssetBase(full);
        setAssetBaseReady(true);
      } catch (err) {
        console.error("[RESOLVE] error:", err);
        bookDataLoader.setAssetBase(null); // fallback to old API path
        if (!cancelled) setAssetBaseReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchKey]);

  return assetBaseReady ? <App /> : null;
};

export const AppWithResolve: React.FC = () => {
  // Check if live mode is enabled (loads from Convex CMS)
  const liveMode = isLiveModeEnabled();
  const book = getBookFromUrl();

  if (liveMode) {
    // In live mode, construct the book path for Convex
    const bookPath = book ? `books/${book}` : "books/1984-English";
    return <LiveModeApp bookPath={bookPath} />;
  }

  // This condition is compile-time in Vite; ESLint still sees a conditional,
  // so we keep hooks out of this component entirely.
  return import.meta.env.DEV ? <App /> : <AppWithResolveProd />;
};
