import React, { useEffect, useRef, useState, Suspense, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { createPortal } from "react-dom";

import { useRouteTransition } from "./providers/RouteTransitionProvider";
import { books } from "@platform/books";
import { unloadBookColorsCSS } from "../../player/src/utils/loadBookColors";
import Paywall from "./components/Paywall";
import AuthRequiredModal from "./components/AuthRequiredModal";
import { teardownPlayer } from "../../player/src/teardown";
import { useAuth } from "./hooks/useAuth";
import { detectLanguageFromDomain } from "@platform/utils/languageDetection";

const PlayerApp = React.lazy(() => import("./player/PlayerRoot"));
const PAYWALL_FADE_MS = 300;
const AUTH_MODAL_FADE_MS = 300;

type ResolveError = Error & { status?: number };

const WrappedPlayerApp = () => {
  const [searchParams] = useSearchParams();
  const {
    startTransition,
    finishTransition,
    cancelTransition,
    navigatedFromPlatform,
    setNavigatedFromPlatform,
    updateTransitionMeta,
    navigating,
  } = useRouteTransition();
  const auth = useAuth();

  const book = searchParams.get("book");

  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [hasUserStarted, setHasUserStarted] = useState(false);
  const [assetBaseReady, setAssetBaseReady] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [bookSlug, setBookSlug] = useState("");
  const [bookTitle, setBookTitle] = useState("");

  const lastBookRef = useRef<string | null>(null);
  const [paywallMounted, setPaywallMounted] = useState(false);
  const paywallHostRef = useRef<HTMLDivElement | null>(null);

  // Snapshot whether this transition should require a Start click (direct load)
  const requiresStartRef = useRef(false);

  // Auth modal state and host
  const [showAuth, setShowAuth] = useState(false);
  const [authVisible, setAuthVisible] = useState(false);
  const [authMounted, setAuthMounted] = useState(false);
  const authHostRef = useRef<HTMLDivElement | null>(null);

  // Guards to ensure we finish only once and coordinate "Start" click with app readiness
  const userInteractedRef = useRef(false);
  const isPlayerReadyRef = useRef(false);
  const finishedRef = useRef(false);

  useEffect(() => {
    isPlayerReadyRef.current = isPlayerReady;
  }, [isPlayerReady]);

  // Centralized safe finish that cannot fire twice
  const safeFinish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;

    finishTransition();
    console.log("BOOK LOADER App is ready");

    window.setTimeout(() => {
      console.log("BOOK LOADER App is ready, hiding splash screen");
      window.dispatchEvent(new CustomEvent("splashHidden"));
    }, 1000);
  }, [finishTransition]);

  // When user clicks "Start", remember the interaction and finish if app is already ready
  const handleStartClick = useCallback(() => {
    userInteractedRef.current = true;
    setHasUserStarted(true);
    if (isPlayerReadyRef.current) safeFinish();
  }, [safeFinish]);

  useEffect(() => {
    const handleShowPaywall = (event: CustomEvent) => {
      setShowPaywall(true);
      setBookSlug(event.detail.bookSlug);
      setBookTitle(event.detail.bookTitle);
    };

    window.addEventListener("ShowPaywall", handleShowPaywall as EventListener);
    return () => window.removeEventListener("ShowPaywall", handleShowPaywall as EventListener);
  }, []);

  // Listen for auth modal trigger from player
  useEffect(() => {
    const handleShowAuth = (_event: Event) => {
      // Optionally inspect (event as CustomEvent).detail?.reason
      setShowAuth(true);
    };
    window.addEventListener("ShowAuthModal", handleShowAuth as EventListener);
    return () => window.removeEventListener("ShowAuthModal", handleShowAuth as EventListener);
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

  // Mount/unmount and fade for auth modal
  useEffect(() => {
    if (showAuth) {
      setAuthMounted(true);
      setAuthVisible(false);
      requestAnimationFrame(() => setAuthVisible(true));
    } else if (authMounted) {
      setAuthVisible(false);
      const t = setTimeout(() => setAuthMounted(false), AUTH_MODAL_FADE_MS);
      return () => clearTimeout(t);
    }
  }, [showAuth, authMounted]);

  useEffect(() => {
    const onReady = () => {
      setIsPlayerReady(true);

      if (!requiresStartRef.current) {
        setHasUserStarted(true);
        safeFinish();
      } else {
        updateTransitionMeta({ showStartButton: true, onStartClick: handleStartClick });
      }
    };

    window.addEventListener("appReady", onReady);
    return () => window.removeEventListener("appReady", onReady);
  }, [safeFinish, updateTransitionMeta, handleStartClick]);

  // Handle book changes and setup/transition logic
  useEffect(() => {
    if (book !== lastBookRef.current) {
      // Reset per-book guards
      finishedRef.current = false;
      userInteractedRef.current = false;
      setIsPlayerReady(false);
      setHasUserStarted(false);

      lastBookRef.current = book;
      unloadBookColorsCSS();
      // bookDataLoader.resetCurrentBook();

      // If overlay has ALREADY started on the platform, do NOT start it again here.
      // This avoids double startTransition when navigating from the grid.
      const shouldStartHere = !!book && !(navigatedFromPlatform && navigating);

      // If we're starting the transition here, treat this as a direct load.
      // This avoids stale "navigatedFromPlatform" state from prior sessions.
      if (shouldStartHere) {
        setNavigatedFromPlatform(false);
        requiresStartRef.current = true;
      } else if (navigatedFromPlatform) {
        requiresStartRef.current = false;
      }

      if (shouldStartHere && book) {
        const meta = books.find((b) => b.slug === book);
        const title = meta?.title ?? "BookGenius";
        const phrases = meta?.metadata?.[detectLanguageFromDomain()]?.phrases ?? [];
        const author = meta?.author ?? "";

        // For direct loads we DO NOT show Start yet; it appears only after appReady.
        startTransition({
          title,
          phrases,
          author,
          showStartButton: false,
          onStartClick: handleStartClick,
        });
      }

      if (!book) {
        setAssetBaseReady(false);
        return;
      }

      // bookDataLoader.setCurrentBook(book);
    }
  }, [book, navigatedFromPlatform, navigating, startTransition, handleStartClick]);

  // Handle asset base resolution - waits for both book and auth to be ready

  useEffect(() => {
    if (!book) {
      return;
    }

    if (import.meta.env.DEV) {
      // bookDataLoader.setAssetBase(`/books/${book}/`);
      setAssetBaseReady(true);
      return;
    }

    // Wait for auth to be ready before fetching (ensures session cookies are set)
    if (!auth.ready) {
      return;
    }

    const resolveBookContent = async (
      mode: "signed-in" | "anon",
      { forceFreshToken = false }: { forceFreshToken?: boolean } = {},
    ) => {
      const headers: Record<string, string> = {};

      if (mode === "signed-in") {
        let token: string | null | undefined = null;

        if (forceFreshToken && auth.refreshToken) {
          token = await auth.refreshToken().catch(() => null);
        } else if (auth.getToken) {
          token = await auth.getToken({ skipCache: forceFreshToken }).catch(() => null);
        } else if (auth.refreshToken) {
          token = await auth.refreshToken().catch(() => null);
        }

        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }
      }

      setAssetBaseReady(true);
    };

    (async () => {
      setAssetBaseReady(false);

      try {
        await resolveBookContent(auth.isSignedIn ? "signed-in" : "anon");
      } catch (err: unknown) {
        console.warn("[RESOLVE] error, evaluating recovery steps:", err);
        const status = (err as ResolveError)?.status;

        if ((status === 401 || status === 403) && auth.isSignedIn) {
          try {
            await resolveBookContent("signed-in", { forceFreshToken: true });
            return;
          } catch (refreshErr: unknown) {
            console.warn("[RESOLVE] retry after token refresh failed:", refreshErr);
          }
        }

        if ((status === 401 || status === 403) && !auth.isSignedIn) {
          console.warn("[RESOLVE] retrying without credentials to load demo content.");
          try {
            await resolveBookContent("anon");
            return;
          } catch (cookieErr: unknown) {
            console.warn("[RESOLVE] retry without credentials failed:", cookieErr);
          }
        }

        console.error("[RESOLVE] attempting final retry after delay.");
        await new Promise((resolve) => setTimeout(resolve, 3000));
        try {
          if (auth.isSignedIn) {
            await resolveBookContent("signed-in", { forceFreshToken: true });
          } else {
            await resolveBookContent("anon");
          }
        } catch (err: unknown) {
          console.error(
            "[RESOLVE] error final attempt failed. Keeping splash visible for manual retry.",
            err,
          );
          if (auth.isSignedIn) {
            console.warn("[RESOLVE] prompting auth modal after repeated failures.");
            setShowAuth(true);
          }
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- FALSE POSITIVE: We intentionally depend on auth.ready and auth.isSignedIn, not the full auth object which changes on every render
  }, [book, auth.ready, auth.isSignedIn]);

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
          // bookDataLoader.resetCurrentBook();

          // 2. Then tear down the player runtime
          await teardownPlayer();
        } catch (e) {
          console.error("WrappedPlayerApp: cleanup failed", e);
        }
      };

      // Run cleanup but don't await (component is unmounting)
      void cleanup();
    };
  }, [cancelTransition, setNavigatedFromPlatform]);

  useEffect(() => {
    const playerScopeElement = document.getElementById("player-scope");
    if (!playerScopeElement) return;

    const shouldShow = isPlayerReady && (!requiresStartRef.current || hasUserStarted);

    if (shouldShow) {
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
  }, [isPlayerReady, hasUserStarted]);

  return (
    <div
      className={`w-full h-full border-0 transition-opacity duration-100 ${isPlayerReady ? "opacity-100" : "opacity-0"}`}
    >
      {assetBaseReady ? (
        <Suspense fallback={null}>
          <PlayerApp />
        </Suspense>
      ) : null}

      {paywallMounted && (
        <div
          ref={paywallHostRef}
          className={`fixed inset-0 z-[1000] transition-opacity duration-1000 ${paywallVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        />
      )}

      {authMounted && (
        <div
          ref={authHostRef}
          className={`fixed inset-0 z-[1000] transition-opacity duration-1000 ${authVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        />
      )}

      {/* render Paywall INTO the fading host */}
      {showPaywall &&
        paywallHostRef.current &&
        createPortal(
          <Paywall
            bookSlug={bookSlug}
            bookTitle={bookTitle}
            onClose={() => setShowPaywall(false)}
          />,
          paywallHostRef.current,
        )}

      {/* render Auth modal INTO its fading host */}
      {showAuth &&
        authHostRef.current &&
        createPortal(<AuthRequiredModal onClose={() => setShowAuth(false)} />, authHostRef.current)}
    </div>
  );
};

export default WrappedPlayerApp;
