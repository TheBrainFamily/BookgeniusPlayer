import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { BookLoader } from "@platform/components/BookLoader";

type LoaderMeta = { title: string; phrases: string[]; author?: string; showStartButton?: boolean; onStartClick?: () => void };

type Ctx = {
  // starts the overlay with BookLoader, returns a cleanup you generally
  // don't need to call (use finishTransition instead)
  startTransition: (meta: LoaderMeta) => void;
  // finishes the overlay (e.g., when iframe ready)
  finishTransition: () => void;
  // cancels the overlay immediately (e.g., on error)
  cancelTransition: () => void;
  // is overlay visible
  navigating: boolean;
  // whether user has navigated from platform (vs direct to /reader/)
  navigatedFromPlatform: boolean;
  // set that user has navigated from platform
  setNavigatedFromPlatform: (fromPlatform: boolean) => void;
};

const RouteTransitionContext = createContext<Ctx | null>(null);

export const useRouteTransition = () => {
  const ctx = useContext(RouteTransitionContext);
  if (!ctx) {
    throw new Error("useRouteTransition must be used within provider");
  }
  return ctx;
};

type Props = {
  children: React.ReactNode;
  minDurationMs?: number; // default 100ms
};

export const RouteTransitionProvider: React.FC<Props> = ({ children, minDurationMs = 100 }) => {
  const [navigating, setNavigating] = useState(false);
  const [meta, setMeta] = useState<LoaderMeta | null>(null);
  const [navigatedFromPlatform, setNavigatedFromPlatform] = useState(false);

  const startTimeRef = useRef<number | null>(null);
  const location = useLocation(); // used to reset if user navigates away quickly

  const startTransition = useCallback((m: LoaderMeta) => {
    setMeta({ title: m.title, phrases: m.phrases, author: m.author ?? "", showStartButton: m.showStartButton, onStartClick: m.onStartClick });
    startTimeRef.current = performance.now();
    setNavigating(true);
  }, []);

  const finishTransition = useCallback(() => {
    const now = performance.now();
    const start = startTimeRef.current ?? now;
    const elapsed = now - start;
    const remaining = Math.max(0, minDurationMs - elapsed);

    // Ensure the overlay is visible at least minDurationMs
    const timeout = window.setTimeout(() => {
      setNavigating(false);
      // slight delay to allow fade-out animation before clearing meta
      // We think no need to clear meta, leaving this in case someone sees some glitches. Aug 29 2025 lgandecki dstojaniuk
      // window.setTimeout(() => setMeta((prev) => (navigating ? prev : null)), 250);
    }, remaining);

    return () => clearTimeout(timeout);
  }, [minDurationMs]);

  const cancelTransition = useCallback(() => {
    setNavigating(false);
    setMeta(null);
    startTimeRef.current = null;
  }, []);

  // If the route changes unexpectedly while navigating, keep overlay unless a new
  // startTransition comes in; this helps continuity.
  useEffect(() => {
    // no-op; location access ensures provider updates on route change
  }, [location]);

  const value = useMemo(
    () => ({ startTransition, finishTransition, cancelTransition, navigating, navigatedFromPlatform, setNavigatedFromPlatform }),
    [finishTransition, navigating, startTransition, cancelTransition, navigatedFromPlatform, setNavigatedFromPlatform],
  );

  return (
    <RouteTransitionContext.Provider value={value}>
      {children}

      {/* Single global overlay with BookLoader */}
      <div className={`pointer-events-none fixed inset-0 z-40 transition-opacity duration-1000 ${navigating ? "opacity-100" : "opacity-0"}`} aria-hidden={!navigating}>
        <div className="relative z-10 flex h-full items-center justify-center">
          {meta ? (
            <div className="pointer-events-auto">
              <BookLoader
                title={meta.title}
                author={meta.author}
                loadingPhrases={meta.phrases}
                // While overlay is visible, pretend it's not loaded
                isLoaded={!navigating}
                showStartButton={meta.showStartButton}
                onStartClick={meta.onStartClick}
              />
            </div>
          ) : null}
        </div>
      </div>
    </RouteTransitionContext.Provider>
  );
};
