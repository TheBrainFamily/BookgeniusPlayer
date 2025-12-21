import React from "react";
import { LiveModeApp } from "./LiveModeApp";

function getBookFromUrl(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("book");
  } catch {
    return null;
  }
}

/**
 * App entry point - ALL modes use Convex now.
 * No more static data loading, no more BookIndex.
 */
export const AppWithResolve: React.FC = () => {
  const book = getBookFromUrl();
  const bookPath = book ? `books/${book}` : "books/1984-English";

  return <LiveModeApp bookPath={bookPath} />;
};
