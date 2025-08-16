import React, { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { useRouteTransition } from "./providers/RouteTransitionProvider";
import { bookDataLoader } from "../../player/src/services/bookDataLoader";

const PlayerApp = React.lazy(() => import("./player/PlayerRoot"));

const WrappedApp = () => {
  const [searchParams] = useSearchParams();
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [assetBaseReady, setAssetBaseReady] = useState(false);
  const { finishTransition } = useRouteTransition();
  const lastBookRef = useRef<string | null>(null);

  useEffect(() => {
    const onReady = () => {
      setIsPlayerReady(true);
      finishTransition();
      window.dispatchEvent(new CustomEvent("splashHidden"));
    };
    window.addEventListener("appReady", onReady);
    return () => window.removeEventListener("appReady", onReady);
  }, [finishTransition]);

  useEffect(() => {
    const book = searchParams.get("book");
    if (book !== lastBookRef.current) {
      lastBookRef.current = book;
      bookDataLoader.resetCurrentBook();

      if (!book) {
        setAssetBaseReady(false);
        return;
      }
      bookDataLoader.setCurrentBook(book);

      let cancelled = false;
      (async () => {
        setAssetBaseReady(false);
        try {
          const res = await fetch(`/api/core/content/resolve/${encodeURIComponent(book)}`, { cache: "no-store" });
          if (!res.ok) throw new Error("[RESOLVE] resolve failed");
          const { signedAssetBase, assetPrefix, assetQuery } = await res.json();

          // accept either shape; you already parse full URL in setAssetBase

          if (cancelled) return;
          bookDataLoader.setAssetBase(signedAssetBase ?? (assetPrefix && assetQuery ? `${assetPrefix}?${assetQuery}` : null));
          // optional warm HEAD for index.html to reduce first-media latency (fire-and-forget)
          // try { fetch(`${assetBase}index.html`, { method: "HEAD", cache: "no-store" }); } catch (_) {}
          setAssetBaseReady(true);
        } catch (err: unknown) {
          console.error("[RESOLVE] error:", err);
          bookDataLoader.setAssetBase(null); // fallback to old API path
          if (!cancelled) setAssetBaseReady(true);
        }
      })();
      return () => {
        cancelled = true;
      };
    }
  }, [searchParams]);

  return (
    <div className={`w-full h-full border-0 transition-opacity duration-500 ${!isPlayerReady ? "opacity-0" : "opacity-100"}`}>
      {assetBaseReady ? (
        <Suspense fallback={null /* overlay handles UX */}>
          <PlayerApp />
        </Suspense>
      ) : null}
    </div>
  );
};

export default WrappedApp;
