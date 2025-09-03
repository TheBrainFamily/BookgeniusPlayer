import React, { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { createPortal } from "react-dom";

import { useRouteTransition } from "./providers/RouteTransitionProvider";
import { books } from "@platform/books";
import { bookDataLoader } from "../../player/src/services/bookDataLoader";
import Paywall from "./components/Paywall";
import { teardownPlayer } from "../../player/src/teardown";

const PlayerApp = React.lazy(() => import("./player/PlayerRoot"));
const PAYWALL_FADE_MS = 300;

const WrappedPlayerApp = () => {
  const [searchParams] = useSearchParams();
  const { startTransition, finishTransition, cancelTransition, navigatedFromPlatform, setNavigatedFromPlatform } = useRouteTransition();

  const book = searchParams.get("book");

  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [assetBaseReady, setAssetBaseReady] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [bookSlug, setBookSlug] = useState("");
  const [bookTitle, setBookTitle] = useState("");

  const lastBookRef = useRef<string | null>(null);
  const [paywallMounted, setPaywallMounted] = useState(false);
  const paywallHostRef = useRef<HTMLDivElement | null>(null);

  const handleStartClick = () => {
    finishTransition();
    console.log("BOOK LOADER App is ready");

    window.setTimeout(() => {
      console.log("BOOK LOADER App is ready, hiding splash screen");
      window.dispatchEvent(new CustomEvent("splashHidden"));
    }, 1000);
  };

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

      // If needsUserGesture is true, we wait for Start button click
      if (navigatedFromPlatform) handleStartClick();
    };

    window.addEventListener("appReady", onReady);
    return () => window.removeEventListener("appReady", onReady);
  }, [finishTransition, navigatedFromPlatform]);

  // Ensure loader shows on direct loads to /reader/?book=...
  useEffect(() => {
    if (!book) return;

    const meta = books.find((b) => b.slug === book);
    const title = meta?.title ?? "BookGenius";
    const phrases = meta?.phrases ?? [];
    const author = meta?.author ?? "";

    startTransition({ title, phrases, author, showStartButton: !navigatedFromPlatform && isPlayerReady, onStartClick: handleStartClick });
  }, [book, startTransition, navigatedFromPlatform, isPlayerReady]);

  useEffect(() => {
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
  }, [book]);

  // On unmount (leaving /reader), fully tear down the player environment
  useEffect(() => {
    return () => {
      // Cancel any ongoing transitions first
      cancelTransition();

      // Reset local state immediately to prevent any race conditions
      setIsPlayerReady(false);
      setAssetBaseReady(false);
      setShowPaywall(false);
      setPaywallMounted(false);
      setPaywallVisible(false);
      setNavigatedFromPlatform(false);
      lastBookRef.current = null;

      // Cleanup in correct order
      const cleanup = async () => {
        try {
          // 1. First reset the book data loader to stop any ongoing requests
          bookDataLoader.resetCurrentBook();

          // 2. Then tear down the player runtime
          await teardownPlayer();
        } catch (e) {
          console.error("WrappedPlayerApp: cleanup failed", e);
        }
      };

      // Run cleanup but don't await (component is unmounting)
      void cleanup();
    };
  }, [cancelTransition]);

  useEffect(() => {
    const playerScopeElement = document.getElementById("player-scope");
    if (!playerScopeElement) return;

    if (isPlayerReady) {
      playerScopeElement.classList.add("visible");
      playerScopeElement.removeAttribute("inert");
      playerScopeElement.setAttribute("aria-hidden", "false");
    } else {
      playerScopeElement.classList.remove("visible");
      playerScopeElement.setAttribute("inert", "");
      playerScopeElement.setAttribute("aria-hidden", "true");
    }

    return () => {
      if (!playerScopeElement) return;

      playerScopeElement.classList.remove("visible");
      playerScopeElement.setAttribute("inert", "");
      playerScopeElement.setAttribute("aria-hidden", "true");
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
