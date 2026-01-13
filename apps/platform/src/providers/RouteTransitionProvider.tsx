import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation } from "react-router-dom";
import { SplashScreen, SPLASH_FADE_DURATION_MS } from "@player/components/SplashScreen";

type LoaderMeta = {
  title: string;
  phrases: string[];
  author: string;
  showStartButton?: boolean;
  onStartClick?: () => void;
};

type Ctx = {
  // starts the overlay with BookLoader, returns a cleanup you generally
  // don't need to call (use finishTransition instead)
  startTransition: (meta: LoaderMeta) => void;
  // finishes the overlay (e.g., when iframe ready)
  finishTransition: () => void;
  // cancels the overlay immediately (e.g., on error)
  cancelTransition: () => void;
  // updates only the meta (e.g., toggle Start button) without restarting the overlay
  updateTransitionMeta: (partial: Partial<LoaderMeta>) => void;
  // is overlay visible
  navigating: boolean;
  // whether user has navigated from platform (vs direct to /reader/)
  navigatedFromPlatform: boolean;
  // set that user has navigated from platform
  setNavigatedFromPlatform: (fromPlatform: boolean) => void;
};

const RouteTransitionContext = createContext<Ctx | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
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

// Overlay states for CSS animation sequencing
type OverlayState = "hidden" | "fading-in" | "fading-out";

export const RouteTransitionProvider: React.FC<Props> = ({ children, minDurationMs = 100 }) => {
  const [overlayState, setOverlayState] = useState<OverlayState>("hidden");
  const [meta, setMeta] = useState<LoaderMeta | null>(null);
  const [navigatedFromPlatform, setNavigatedFromPlatform] = useState(false);

  const startTimeRef = useRef<number | null>(null);
  const outerTimeoutRef = useRef<number | null>(null);
  const innerTimeoutRef = useRef<number | null>(null);
  const location = useLocation(); // used to reset if user navigates away quickly

  // Derived state for context consumers
  const navigating = overlayState === "fading-in";

  const startTransition = useCallback((m: LoaderMeta) => {
    setMeta({
      title: m.title,
      phrases: m.phrases,
      author: m.author ?? "",
      showStartButton: m.showStartButton,
      onStartClick: m.onStartClick,
    });
    startTimeRef.current = performance.now();
    setOverlayState("fading-in");
  }, []);

  const finishTransition = useCallback(() => {
    // Clear any pending timeouts first
    if (outerTimeoutRef.current) clearTimeout(outerTimeoutRef.current);
    if (innerTimeoutRef.current) clearTimeout(innerTimeoutRef.current);

    const now = performance.now();
    const start = startTimeRef.current ?? now;
    const elapsed = now - start;
    const remaining = Math.max(0, minDurationMs - elapsed);

    // Ensure the overlay is visible at least minDurationMs
    outerTimeoutRef.current = window.setTimeout(() => {
      setOverlayState("fading-out");

      // After fade-out animation completes, hide fully
      innerTimeoutRef.current = window.setTimeout(() => {
        setOverlayState("hidden");
        setMeta(null);
      }, SPLASH_FADE_DURATION_MS);
    }, remaining);
  }, [minDurationMs]);

  const cancelTransition = useCallback(() => {
    if (outerTimeoutRef.current) clearTimeout(outerTimeoutRef.current);
    if (innerTimeoutRef.current) clearTimeout(innerTimeoutRef.current);
    setOverlayState("hidden");
    setMeta(null);
    startTimeRef.current = null;
  }, []);

  // Update only parts of the meta without toggling the overlay state
  const updateTransitionMeta = useCallback((partial: Partial<LoaderMeta>) => {
    setMeta((prev) => (prev ? { ...prev, ...partial } : prev));
  }, []);

  // If the route changes unexpectedly while navigating, keep overlay unless a new
  // startTransition comes in; this helps continuity.
  useEffect(() => {
    // no-op; location access ensures provider updates on route change
  }, [location]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (outerTimeoutRef.current) clearTimeout(outerTimeoutRef.current);
      if (innerTimeoutRef.current) clearTimeout(innerTimeoutRef.current);
    };
  }, []);

  const value = useMemo(
    () => ({
      startTransition,
      finishTransition,
      cancelTransition,
      updateTransitionMeta,
      navigating,
      navigatedFromPlatform,
      setNavigatedFromPlatform,
    }),
    [
      finishTransition,
      navigating,
      startTransition,
      cancelTransition,
      updateTransitionMeta,
      navigatedFromPlatform,
      setNavigatedFromPlatform,
    ],
  );

  return (
    <RouteTransitionContext.Provider value={value}>
      {/* Platform content - blurs when transitioning */}
      <div
        className={`platform-content ${navigating ? "platform-content--blurring" : ""}`}
        style={{
          transition: `filter ${SPLASH_FADE_DURATION_MS}ms ease-out`,
          filter: navigating ? "blur(8px)" : "blur(0px)",
        }}
      >
        {children}
      </div>

      {/* SplashScreen - fade is handled by #player-scope.visible transition */}
      {meta && (
        <SplashScreen
          book={{ title: meta.title, author: meta.author, loadingPhrases: meta.phrases }}
          autoStart={false}
          isLoaded={overlayState === "fading-out" || overlayState === "hidden"}
          showStartButton={meta.showStartButton}
          onStartClick={meta.onStartClick}
        />
      )}
    </RouteTransitionContext.Provider>
  );
};
