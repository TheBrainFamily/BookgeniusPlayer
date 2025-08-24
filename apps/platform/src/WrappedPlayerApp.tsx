import React, { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { createPortal } from "react-dom";

import { useRouteTransition } from "./providers/RouteTransitionProvider";
import { bookDataLoader } from "../../player/src/services/bookDataLoader";
import Paywall from "./components/Paywall";
import { teardownPlayer } from "../../player/src/teardown";

const PlayerApp = React.lazy(() => import("./player/PlayerRoot"));
const PAYWALL_FADE_MS = 300;

const WrappedPlayerApp = () => {
  const [searchParams] = useSearchParams();
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [assetBaseReady, setAssetBaseReady] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [bookSlug, setBookSlug] = useState("");
  const [bookTitle, setBookTitle] = useState("");
  const { finishTransition } = useRouteTransition();
  const lastBookRef = useRef<string | null>(null);
  const [paywallMounted, setPaywallMounted] = useState(false);
  const paywallHostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleShowPaywall = (event: CustomEvent) => {
      setShowPaywall(true);
      setBookSlug(event.detail.bookSlug);
      setBookTitle(event.detail.bookTitle);
    };
    window.addEventListener("ShowPaywall", handleShowPaywall);
    return () => window.removeEventListener("ShowPaywall", handleShowPaywall);
  }, []);

  useEffect(() => {
    if (showPaywall) {
      setPaywallMounted(true); // mount host
      setPaywallVisible(false); // start at 0
      requestAnimationFrame(() => setPaywallVisible(true)); // fade in next frame
    } else if (paywallMounted) {
      setPaywallVisible(false); // start fade out
      const t = setTimeout(() => setPaywallMounted(false), PAYWALL_FADE_MS); // unmount after transition
      return () => clearTimeout(t);
    }
  }, [showPaywall, paywallMounted]);

  useEffect(() => {
    const onReady = () => {
      setIsPlayerReady(true);
      finishTransition();
      console.log("BOOK LOADER App is ready");

      window.setTimeout(() => {
        console.log("BOOK LOADER App is ready, hiding splash screen");
        window.dispatchEvent(new CustomEvent("splashHidden"));
      }, 1000);
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

      if (import.meta.env.DEV) {
        bookDataLoader.setAssetBase(`/books/${book}/`);
        setAssetBaseReady(true);
        return;
      }

      let cancelled = false;
      (async () => {
        setAssetBaseReady(false);
        try {
          const res = await fetch(`/api/content/resolve/${encodeURIComponent(book)}`, { cache: "no-store" });
          if (!res.ok) throw new Error("[RESOLVE] resolve failed");
          const { signedAssetBase, assetPrefix, assetQuery, visibility } = await res.json();

          // accept either shape; you already parse full URL in setAssetBase

          if (cancelled) return;
          bookDataLoader.setAssetBase(signedAssetBase ?? (assetPrefix && assetQuery ? `${assetPrefix}?${assetQuery}` : null));
          bookDataLoader.setBookVisibility(visibility);
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

  // On unmount (leaving /reader), fully tear down the player environment
  useEffect(() => {
    return () => {
      try {
        // Hard reset player runtime and legacy DOM/media
        void teardownPlayer();
      } catch (e) {
        console.error("teardownPlayer failed", e);
      }
      try {
        // Reset loader state so a new visit starts clean
        bookDataLoader.resetCurrentBook();
      } catch (e) {
        console.error("bookDataLoader.resetCurrentBook failed", e);
      }
      try {
        // Make sure our local gating is reset
        setAssetBaseReady(false);
        lastBookRef.current = null;
      } catch (e) {
        console.error("setAssetBaseReady failed", e);
      }
    };
  }, []);

  useEffect(() => {
    const bodyId = isPlayerReady ? "player-scope" : "platform-scope";
    document.body.id = bodyId;

    return () => {
      document.body.id = "platform-scope";
    };
  }, [isPlayerReady]);

  return (
    <div className={`w-full h-full border-0 transition-opacity duration-100 ${isPlayerReady ? "opacity-100" : "opacity-0"}`}>
      {assetBaseReady ? <Suspense fallback={null}>{createPortal(<PlayerApp />, document.getElementById("root-player")!)}</Suspense> : null}

      {paywallMounted && (
        <div ref={paywallHostRef} className={`fixed inset-0 z-[1000] transition-opacity duration-1000 ${paywallVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`} />
      )}

      {/* render Paywall INTO the fading host */}
      {showPaywall && paywallHostRef.current && createPortal(<Paywall bookSlug={bookSlug} bookTitle={bookTitle} onClose={() => setShowPaywall(false)} />, paywallHostRef.current)}
    </div>
  );
};

export default WrappedPlayerApp;
