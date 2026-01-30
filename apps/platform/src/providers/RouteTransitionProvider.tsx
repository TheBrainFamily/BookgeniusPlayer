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
import { motion, AnimatePresence } from "framer-motion";
import { SplashScreen, SPLASH_FADE_DURATION_MS } from "@player/components/SplashScreen";

/** Rectangle in viewport coordinates for the clicked card */
type CardRect = { x: number; y: number; width: number; height: number };

type LoaderMeta = {
  title: string;
  phrases: string[];
  author: string;
  showStartButton?: boolean;
  onStartClick?: () => void;
  /** Bounding rect of the clicked card for expansion animation */
  cardRect?: CardRect;
  /** Video URL for the expanding card animation */
  video?: string;
  /** Captured video frame as data URL for instant display (no loading delay) */
  capturedFrame?: string | null;
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

// Overlay states for proper CSS animation sequencing
type OverlayState = "hidden" | "fading-in" | "visible" | "fading-out";

// Duration for the Netflix-style card expansion
const EXPANSION_DURATION_MS = 500;

export const RouteTransitionProvider: React.FC<Props> = ({ children, minDurationMs = 100 }) => {
  const [overlayState, setOverlayState] = useState<OverlayState>("hidden");
  const [meta, setMeta] = useState<LoaderMeta | null>(null);
  const [navigatedFromPlatform, setNavigatedFromPlatform] = useState(false);
  const [cardRect, setCardRect] = useState<CardRect | null>(null);
  const [capturedFrame, setCapturedFrame] = useState<string | null>(null);
  // Track when video expansion completes so we can show splash content
  const [expansionComplete, setExpansionComplete] = useState(false);

  const startTimeRef = useRef<number | null>(null);
  const outerTimeoutRef = useRef<number | null>(null);
  const innerTimeoutRef = useRef<number | null>(null);
  const location = useLocation(); // used to reset if user navigates away quickly

  // Derived state for context consumers
  const navigating = overlayState === "fading-in" || overlayState === "visible";

  const startTransition = useCallback((m: LoaderMeta) => {
    setMeta({
      title: m.title,
      phrases: m.phrases,
      author: m.author ?? "",
      showStartButton: m.showStartButton,
      onStartClick: m.onStartClick,
    });
    setCardRect(m.cardRect ?? null);
    setCapturedFrame(m.capturedFrame ?? null);
    setExpansionComplete(false);
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
        setCardRect(null);
        setCapturedFrame(null);
        setExpansionComplete(false);
      }, SPLASH_FADE_DURATION_MS);
    }, remaining);
  }, [minDurationMs]);

  const cancelTransition = useCallback(() => {
    if (outerTimeoutRef.current) clearTimeout(outerTimeoutRef.current);
    if (innerTimeoutRef.current) clearTimeout(innerTimeoutRef.current);
    setOverlayState("hidden");
    setMeta(null);
    setCardRect(null);
    setCapturedFrame(null);
    setExpansionComplete(false);
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
      {/* Dark backdrop - visible when platform content scales down */}
      <div style={{ position: "fixed", inset: 0, backgroundColor: "rgb(17,13,12)", zIndex: -1 }} />

      {/* Platform content - scales DOWN when navigating (Netflix push-back effect) */}
      <div
        className="platform-content"
        style={{
          transition: `filter ${EXPANSION_DURATION_MS}ms ease-out, transform ${EXPANSION_DURATION_MS}ms ease-out`,
          filter: navigating ? "blur(8px)" : "blur(0px)",
          transform: navigating ? "scale(0.95)" : "scale(1)",
          transformOrigin: "center center",
        }}
      >
        {children}
      </div>

      {/* Netflix-style expanding card - expands to full screen while blurring/darkening */}
      {/* Uses captured frame (instant) instead of video (loading delay) */}
      <AnimatePresence>
        {meta && overlayState !== "hidden" && cardRect && capturedFrame && (
          <motion.div
            key="expanding-frame"
            initial={{
              left: cardRect.x,
              top: cardRect.y,
              width: cardRect.width,
              height: cardRect.height,
              borderRadius: 12,
              backgroundColor: "transparent",
            }}
            animate={{
              left: 0,
              top: 0,
              width: window.innerWidth,
              height: window.innerHeight,
              borderRadius: 0,
              backgroundColor: "#1a1a1a",
            }}
            transition={{ duration: EXPANSION_DURATION_MS / 1000, ease: [0.4, 0, 0.2, 1] as const }}
            onAnimationComplete={() => setExpansionComplete(true)}
            style={{ position: "fixed", overflow: "hidden", zIndex: 9998 }}
          >
            {/* Captured frame blurs, darkens, and fades - revealing solid bg behind */}
            <motion.img
              src={capturedFrame}
              alt=""
              initial={{ filter: "blur(0px) brightness(1)", opacity: 1 }}
              animate={{ filter: "blur(20px) brightness(0.3)", opacity: 0 }}
              transition={{ duration: EXPANSION_DURATION_MS / 1000, ease: "easeOut" }}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* SplashScreen - fades in AFTER expansion completes (or immediately if no expansion) */}
      {meta && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{
            // If there's an expanding animation, wait for it. Otherwise show immediately.
            opacity: cardRect && capturedFrame ? (expansionComplete ? 1 : 0) : 1,
          }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          style={{ position: "fixed", inset: 0, zIndex: 9999, pointerEvents: "auto" }}
        >
          <SplashScreen
            book={{ title: meta.title, author: meta.author, loadingPhrases: meta.phrases }}
            autoStart={false}
            isLoaded={overlayState === "fading-out" || overlayState === "hidden"}
            showStartButton={meta.showStartButton}
            onStartClick={meta.onStartClick}
          />
        </motion.div>
      )}
    </RouteTransitionContext.Provider>
  );
};
