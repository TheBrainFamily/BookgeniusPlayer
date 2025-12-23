import React from "react";
import { LiveModeApp } from "./LiveModeApp";
import { getBookFromUrl } from "./getBookFromUrl";

/**
 * App entry point - ALL modes use Convex now.
 * No more static data loading, no more BookIndex.
 */
export const AppWithResolve: React.FC = () => {
  const book = getBookFromUrl();
  const bookPath = book ? `books/${book}` : "books/1984-English";

  return <LiveModeApp bookPath={bookPath} />;
};
