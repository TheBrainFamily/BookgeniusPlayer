import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { BookLoader } from "@platform/components/BookLoader";

type LoaderMeta = { title: string; phrases: string[]; subtitle?: string };

type Ctx = {
  // starts the overlay with BookLoader, returns a cleanup you generally
  // don't need to call (use finishTransition instead)
  startTransition: (meta: LoaderMeta) => void;
  // finishes the overlay (e.g., when iframe ready)
  finishTransition: () => void;
  // is overlay visible
  navigating: boolean;
  // configure min visible time
  setMinDurationMs: (ms: number) => void;
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
  defaultMinDurationMs?: number; // default 50ms
};

export const RouteTransitionProvider: React.FC<Props> = ({ children, defaultMinDurationMs = 50 }) => {
  const [navigating, setNavigating] = useState(false);
  const [meta, setMeta] = useState<LoaderMeta | null>(null);
  const [minDurationMs, setMinDurationMs] = useState(defaultMinDurationMs);

  const startTimeRef = useRef<number | null>(null);
  const finishRequestedRef = useRef(false);
  const location = useLocation(); // used to reset if user navigates away quickly

  const startTransition = useCallback((m: LoaderMeta) => {
    setMeta({ title: m.title, phrases: m.phrases, subtitle: m.subtitle ?? "Loading..." });
    startTimeRef.current = performance.now();
    finishRequestedRef.current = false;
    setNavigating(true);
  }, []);

  const finishTransition = useCallback(() => {
    finishRequestedRef.current = true;
    const now = performance.now();
    const start = startTimeRef.current ?? now;
    const elapsed = now - start;
    const remaining = Math.max(0, minDurationMs - elapsed);

    // Ensure the overlay is visible at least minDurationMs
    const timeout = window.setTimeout(() => {
      setNavigating(false);
      // slight delay to allow fade-out animation before clearing meta
      window.setTimeout(() => setMeta((prev) => (navigating ? prev : null)), 250);
    }, remaining);

    return () => clearTimeout(timeout);
  }, [minDurationMs, navigating]);

  // If the route changes unexpectedly while navigating, keep overlay unless a new
  // startTransition comes in; this helps continuity.
  useEffect(() => {
    // no-op; location access ensures provider updates on route change
  }, [location]);

  const value = useMemo(() => ({ startTransition, finishTransition, navigating, setMinDurationMs }), [finishTransition, navigating, startTransition]);

  console.log("BOOK LOADER PROVIDER RENDER", { navigating, value });

  return (
    <RouteTransitionContext.Provider value={value}>
      {children}

      {/* Single global overlay with BookLoader */}
      <div className={`pointer-events-none fixed inset-0 z-40 transition-opacity duration-1000 ${navigating ? "opacity-100" : "opacity-0"}`} aria-hidden={!navigating}>
        <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />
        <div className="relative z-10 flex h-full items-center justify-center">
          {meta ? (
            <div className="pointer-events-auto">
              <BookLoader
                title={meta.title}
                subtitle={meta.subtitle ?? "Loading..."}
                loadingPhrases={meta.phrases}
                // While overlay is visible, pretend it's not loaded
                isLoaded={false}
              />
            </div>
          ) : null}
        </div>
      </div>
    </RouteTransitionContext.Provider>
  );
};
