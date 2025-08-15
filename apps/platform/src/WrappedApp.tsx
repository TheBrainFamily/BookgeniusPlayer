import App from "../../player/src/App";

// import "./styles/globals.css";
import "../../player/src/styles/styles.css";
import "../../player/src/styles/modals.css";
import "../../player/src/styles/inline-avatars.css";
// import "../../player/src/styles/book-theme.css";
import "../../player/src/i18n";
import { useRouteTransition } from "./providers/RouteTransitionProvider";
import { useSearchParams } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { bookDataLoader } from "../../player/src/services/bookDataLoader";

export const WrappedApp = () => {
  const [searchParams] = useSearchParams();
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const { finishTransition } = useRouteTransition();
  const lastBookRef = useRef<string | null>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
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
    <div className={`w-full h-full border-0 transition-opacity duration-500 ${!isPlayerReady ? "opacity-0" : "opacity-100"}`}>
      <App />
    </div>
  );
};
