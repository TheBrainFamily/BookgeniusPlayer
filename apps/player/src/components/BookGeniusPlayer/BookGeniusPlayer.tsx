/**
 * BookGeniusPlayer - Embeddable Player Component
 *
 * A clean wrapper for embedding the player in other applications.
 * Handles DOM creation, Convex connection, and lifecycle events.
 *
 * Usage:
 * ```tsx
 * <BookGeniusPlayer
 *   book="1984"
 *   convexClient={existingClient}  // Optional: reuse authenticated client
 *   onReady={() => console.log('Player ready')}
 * />
 * ```
 */

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { LiveModeAppCore } from "@player/LiveModeApp";
import { NativeShellProvider } from "@player/context/NativeShellContext";
import { PlayerDOMProvider } from "@player/context/PlayerDOMContext";
import { useEffect, useMemo } from "react";

export interface BookGeniusPlayerProps {
  /** Book identifier (slug or ID) */
  book: string;
  /** Optional: Reuse an existing Convex client (e.g., authenticated from platform) */
  convexClient?: ConvexReactClient;
  /** Convex URL - required if convexClient is not provided */
  convexUrl?: string;
  /** Called when the player is ready to start playback */
  onReady?: () => void;
  /** Called when player encounters an error */
  onError?: (error: string) => void;
}

/**
 * Component that listens for player ready event and calls the callback
 */
function ReadyListener({ onReady }: { onReady?: () => void }) {
  useEffect(() => {
    if (!onReady) return;

    let called = false;
    const handleReady = () => {
      if (called) return;
      called = true;
      onReady();
    };

    window.addEventListener("appReady", handleReady);
    return () => window.removeEventListener("appReady", handleReady);
  }, [onReady]);

  return null;
}

export function BookGeniusPlayer({
  book,
  convexClient,
  convexUrl,
  onReady,
  onError,
}: BookGeniusPlayerProps) {
  // Determine the URL to use for creating a client
  const clientUrl = convexUrl || import.meta.env.VITE_CONVEX_URL;

  // Create our own client if none provided (memoized to create only once)
  const ownClient = useMemo(() => {
    if (convexClient) return null; // Don't create if external client provided
    if (!clientUrl) return null; // Can't create without URL
    return new ConvexReactClient(clientUrl);
  }, [convexClient, clientUrl]);

  const activeClient = convexClient || ownClient;

  // Handle missing configuration
  useEffect(() => {
    if (!activeClient && onError) {
      onError("Convex client or URL is required");
    }
  }, [activeClient, onError]);

  if (!activeClient) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100%",
          backgroundColor: "#1a1a1a",
          color: "#ff6b6b",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "24px", marginBottom: "16px" }}>Configuration Error</div>
          <div style={{ fontSize: "14px", color: "#888" }}>Convex client or URL is required</div>
        </div>
      </div>
    );
  }

  return (
    <ConvexProvider client={activeClient}>
      <NativeShellProvider>
        <PlayerDOMProvider>
          <ReadyListener onReady={onReady} />
          <LiveModeAppCore bookPath={book} />
        </PlayerDOMProvider>
      </NativeShellProvider>
    </ConvexProvider>
  );
}
