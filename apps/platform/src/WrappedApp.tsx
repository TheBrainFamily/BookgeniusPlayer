import "./player.css";
import Player from "../../player/src/App";
import "../../player/src/i18n";

import { createPortal } from "react-dom";
import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

import { useRouteTransition } from "./providers/RouteTransitionProvider";
import { bookDataLoader } from "../../player/src/services/bookDataLoader";

export const WrappedApp = () => {
  const [searchParams] = useSearchParams();
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const { finishTransition } = useRouteTransition();
  const lastBookRef = useRef<string | null>(null);

  useEffect(() => {
    const handleMessage = () => {
      setIsPlayerReady(true);
      // Fade out the overlay (enforces min duration internally)
      finishTransition();
      window.dispatchEvent(new CustomEvent("splashHidden"));
    };
    window.addEventListener("appReady", handleMessage);
    return () => window.removeEventListener("appReady", handleMessage);
  }, [finishTransition]);

  // Watch the `?book=` query param and reset the player loader if it changes
  useEffect(() => {
    const bookFromQuery = searchParams.get("book");
    if (bookFromQuery !== lastBookRef.current) {
      lastBookRef.current = bookFromQuery;
      bookDataLoader.resetCurrentBook();
    }
  }, [searchParams]);

  useEffect(() => {
    if (isPlayerReady) {
      document.body.id = "player-scope";
    }

    return () => {
      document.body.id = "platform-scope";
    };
  }, [isPlayerReady]);

  const mountNode = typeof document !== "undefined" ? document.getElementById("root-player") : null;
  if (!mountNode) return null;

  const ui = (
    //TODO: Possibly we dont need to wrap with the div, I'm leaving it so the mechanism is here
    <div className={`w-full h-full transition-opacity duration-500 ${!isPlayerReady ? "opacity-0" : "opacity-100"}`}>
      <Player />
    </div>
  );

  return createPortal(ui, mountNode);
};
