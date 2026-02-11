/**
 * PlayerWithConvex - Player wrapper for platform
 *
 * Convex context is now provided at the app level (ConvexAppProvider),
 * so this component just sets up the player DOM structure and renders LiveModeAppCore.
 */
import React from "react";
import { createPortal } from "react-dom";
import { LiveModeAppCore } from "../../../player/src/LiveModeApp";
import { getBookFromUrl } from "../../../player/src/getBookFromUrl";
import { NativeShellProvider } from "../../../player/src/context/NativeShellContext";
import { PlayerDOMProvider, usePlayerDOM } from "../../../player/src/context/PlayerDOMContext";
import { convex } from "../convexClient";

// Import player styles
import "../../../player/src/styles/imports.css";

const PlayerPortal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { rootPlayer } = usePlayerDOM();
  return createPortal(children, rootPlayer);
};

const PlayerWithConvex: React.FC = () => {
  const book = getBookFromUrl();
  const bookPath = book ? `books/${book}` : "books/1984-English";

  if (!convex) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          backgroundColor: "#1a1a1a",
          color: "#ff6b6b",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "24px", marginBottom: "16px" }}>Configuration Error</div>
          <div style={{ fontSize: "14px", color: "#888" }}>
            VITE_CONVEX_URL environment variable is not set
          </div>
        </div>
      </div>
    );
  }

  return (
    <NativeShellProvider>
      <PlayerDOMProvider>
        <PlayerPortal>
          <LiveModeAppCore bookPath={bookPath} />
        </PlayerPortal>
      </PlayerDOMProvider>
    </NativeShellProvider>
  );
};

export default PlayerWithConvex;
