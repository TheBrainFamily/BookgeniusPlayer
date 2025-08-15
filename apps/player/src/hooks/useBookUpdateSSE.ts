import { useEffect, useRef } from "react";
import { bookDataLoader } from "@player/services/bookDataLoader";

interface BookUpdateEvent {
  type: "connected" | "processing-started" | "book-updated" | "processing-error";
  book: string;
  timestamp?: string;
  error?: string;
  clientId?: string;
}

interface UseBookUpdateSSEOptions {
  onBookUpdated?: () => void;
  onProcessingStarted?: () => void;
  onProcessingError?: (error: string) => void;
  enabled?: boolean;
}

export function useBookUpdateSSE({ onBookUpdated, onProcessingStarted, onProcessingError, enabled = true }: UseBookUpdateSSEOptions = {}) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isConnectingRef = useRef(false);

  // Store callbacks in refs to avoid reconnection on callback changes
  const callbacksRef = useRef({ onBookUpdated, onProcessingStarted, onProcessingError });

  // Update callbacks ref on each render
  useEffect(() => {
    callbacksRef.current = { onBookUpdated, onProcessingStarted, onProcessingError };
  });

  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Prevent duplicate connections
    if (isConnectingRef.current || eventSourceRef.current?.readyState === EventSource.OPEN) {
      return;
    }

    const connect = () => {
      const currentBook = bookDataLoader.getCurrentBook();
      const sseUrl = `http://localhost:3000/api/text-editor/sse/book-updates?book=${encodeURIComponent(currentBook)}`;

      console.log(`[SSE] Connecting to book updates for: ${currentBook}`);
      isConnectingRef.current = true;

      const eventSource = new EventSource(sseUrl);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log("[SSE] Connection established");
        reconnectAttemptsRef.current = 0;
        isConnectingRef.current = false;
      };

      eventSource.onmessage = (event) => {
        try {
          const data: BookUpdateEvent = JSON.parse(event.data);
          console.log("[SSE] Received event:", data);

          switch (data.type) {
            case "connected":
              console.log(`[SSE] Connected for book: ${data.book}`);
              break;

            case "processing-started":
              console.log(`[SSE] Processing started for book: ${data.book}`);
              callbacksRef.current.onProcessingStarted?.();
              break;

            case "book-updated":
              console.log(`[SSE] Book updated: ${data.book}`);
              callbacksRef.current.onBookUpdated?.();
              break;

            case "processing-error":
              console.error(`[SSE] Processing error for book ${data.book}:`, data.error);
              callbacksRef.current.onProcessingError?.(data.error || "Unknown error");
              break;
          }
        } catch (error) {
          console.error("[SSE] Failed to parse event data:", error);
        }
      };

      eventSource.onerror = (error) => {
        console.error("[SSE] Connection error:", error);
        eventSource.close();
        eventSourceRef.current = null;
        isConnectingRef.current = false;

        // Implement exponential backoff for reconnection
        const backoffDelay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        reconnectAttemptsRef.current++;

        console.log(`[SSE] Reconnecting in ${backoffDelay}ms (attempt ${reconnectAttemptsRef.current})`);

        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, backoffDelay);
      };
    };

    connect();

    // Cleanup function
    return () => {
      console.log("[SSE] Cleaning up connection");

      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [enabled]); // Only reconnect if enabled changes, not on callback changes

  return { isConnected: eventSourceRef.current?.readyState === EventSource.OPEN };
}
