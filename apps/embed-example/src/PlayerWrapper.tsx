/**
 * PlayerWrapper - Integrates the actual BookGenius player
 *
 * This wrapper replicates platform's WrappedPlayerApp approach:
 * 1. Listen for 'appReady' event (fired when backgrounds loaded)
 * 2. Add .visible class to #player-scope to fade in the player
 * 3. Dispatch 'splashHidden' after delay to trigger content visibility
 *
 * IMPORTANT: Uses createPortal to render into #root-player (inside #player-scope)
 * so the player is completely self-contained and doesn't pollute the host app's DOM.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { NativeShellProvider } from "@player/context/NativeShellContext";
import { PlayerDOMProvider } from "@player/context/PlayerDOMContext";
import { LiveModeAppCore } from "@player/LiveModeApp";

// Note: Player styles are imported in main.tsx via styles/index.css

const convexUrl = import.meta.env.VITE_CONVEX_URL as string;
if (!convexUrl) {
  throw new Error("VITE_CONVEX_URL environment variable is not set");
}
const convex = new ConvexReactClient(convexUrl);

export interface PlayerWrapperProps {
  bookSlug: string;
  /** Called when the player is ready (backgrounds loaded) */
  onReady?: () => void;
}

export default function PlayerWrapper({ bookSlug, onReady }: PlayerWrapperProps) {
  const bookPath = `books/${bookSlug}`;
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const finishedRef = useRef(false);

  // Replicate platform's safeFinish - dispatches splashHidden after delay
  const safeFinish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;

    console.log("[PlayerWrapper] App is ready");

    // Notify parent that player is ready (for splash screen fade-out)
    onReady?.();

    // Match platform's 1 second delay before hiding splash
    window.setTimeout(() => {
      console.log("[PlayerWrapper] Dispatching splashHidden");
      window.dispatchEvent(new CustomEvent("splashHidden"));
    }, 1000);
  }, [onReady]);

  // Listen for appReady event (fired when backgrounds loaded)
  useEffect(() => {
    const handleAppReady = () => {
      console.log("[PlayerWrapper] appReady received");
      setIsPlayerReady(true);
      safeFinish();
    };

    window.addEventListener("appReady", handleAppReady);
    return () => window.removeEventListener("appReady", handleAppReady);
  }, [safeFinish]);

  // Manage #player-scope visibility - exactly like platform's WrappedPlayerApp
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
      playerScopeElement.classList.remove("visible");
      playerScopeElement.setAttribute("inert", "");
      playerScopeElement.setAttribute("aria-hidden", "true");
    };
  }, [isPlayerReady]);

  // Reset state when book changes
  useEffect(() => {
    finishedRef.current = false;
    setIsPlayerReady(false);
  }, [bookSlug]);

  // Find portal target after PlayerDOMProvider creates it
  useEffect(() => {
    // Poll for #root-player which is created by PlayerDOMProvider
    const checkForTarget = () => {
      const target = document.getElementById("root-player");
      if (target) {
        setPortalTarget(target);
      }
    };

    // Check immediately and poll briefly in case of timing
    checkForTarget();
    const interval = setInterval(checkForTarget, 50);
    const timeout = setTimeout(() => clearInterval(interval), 500);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, []);

  if (!convexUrl) {
    return <div style={{ color: "red" }}>VITE_CONVEX_URL not set</div>;
  }

  // Render PlayerDOMProvider first (creates DOM structure), then portal content into #root-player
  return (
    <NativeShellProvider>
      <PlayerDOMProvider>
        <ConvexProvider client={convex}>
          {portalTarget
            ? createPortal(<LiveModeAppCore bookPath={bookPath} />, portalTarget)
            : null}
        </ConvexProvider>
      </PlayerDOMProvider>
    </NativeShellProvider>
  );
}
