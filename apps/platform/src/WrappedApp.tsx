import Player from "../../player/src/App";
import "./player.css";

import "../../player/src/i18n";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useRouteTransition } from "./providers/RouteTransitionProvider";
import { bookDataLoader } from "../../player/src/services/bookDataLoader";
// import ShadowPlayer from "./ShadowPlayer";

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

  //TODO: Possibly we dont need to wrap with the div, I'm leaving it so the mechanism is here
  return (
    <div className={`w-full h-full transition-opacity duration-500 ${!isPlayerReady ? "opacity-0" : "opacity-100"}`}>
      {/* <ShadowPlayer hostId="player-root" hostClassName="player-scope" /> */}
      <Player />
    </div>
  );
};
