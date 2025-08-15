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
  const [assetBaseReady, setAssetBaseReady] = useState(false);
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

      if (!bookFromQuery) {
        setAssetBaseReady(false);
        return;
      }

      // ensure book is known to loader
      bookDataLoader.setCurrentBook(bookFromQuery);

      // resolve once per book: call the API and set assetBase on loader
      let cancelled = false;
      (async () => {
        setAssetBaseReady(false);
        try {
          const res = await fetch(`/api/core/content/resolve/${encodeURIComponent(bookFromQuery)}`, { cache: "no-store" });
          if (!res.ok) throw new Error("[RESOLVE] resolve failed");
          const { signedAssetBase } = await res.json();
          console.log("[RESOLVE] assetBase", signedAssetBase);
          if (cancelled) return;
          bookDataLoader.setAssetBase(signedAssetBase);
          // optional warm HEAD for index.html to reduce first-media latency (fire-and-forget)
          // try { fetch(`${assetBase}index.html`, { method: "HEAD", cache: "no-store" }); } catch (_) {}
          setAssetBaseReady(true);
        } catch (err) {
          console.error("[RESOLVE] Failed to resolve assetBase:", err);
          // fallback: allow app to mount and use the old API endpoints
          bookDataLoader.setAssetBase(null);
          setAssetBaseReady(true);
        }
      })();
      return () => {
        cancelled = true;
      };
    }
  }, [searchParams]);

  return <div className={`w-full h-full border-0 transition-opacity duration-500 ${!isPlayerReady ? "opacity-0" : "opacity-100"}`}>{assetBaseReady ? <App /> : null}</div>;
};
