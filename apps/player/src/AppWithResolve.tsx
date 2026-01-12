import React from "react";
import { LiveModeApp } from "./LiveModeApp";
import { getBookFromUrl } from "./getBookFromUrl";
import { NativeShellProvider } from "./context/NativeShellContext";
import { PlayerDOMProvider } from "./context/PlayerDOMContext";

/**
 * App entry point - ALL modes use Convex now.
 * No more static data loading, no more BookIndex.
 *
 * PlayerDOMProvider adopts existing DOM elements from index.html.
 */
export const AppWithResolve: React.FC = () => {
  const book = getBookFromUrl();
  const bookPath = book ? `books/${book}` : "books/1984-English";

  return (
    <NativeShellProvider>
      <PlayerDOMProvider>
        <LiveModeApp bookPath={bookPath} />
      </PlayerDOMProvider>
    </NativeShellProvider>
  );
};
