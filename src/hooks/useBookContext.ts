import { useEffect, useRef, useCallback } from "react";
import { RealtimeClient } from "@openai/realtime-api-beta";
import { useLocationRange } from "./useLocationRange";
import { extractBookTextFromLocation, extractBookTextUpToLocation } from "@/utils/extractBookText";
import type { BookContextState, BookContextLocation, BookContextChunk } from "@/types/bookContext";

interface UseBookContextProps {
  client: RealtimeClient | null;
  isConnected: boolean;
}

/**
 * Hook to manage sending book context to the RealtimeClient
 * Tracks what content has been sent and sends incremental updates as the user progresses
 */
export function useBookContext({ client, isConnected }: UseBookContextProps) {
  const {
    debouncedLocation: { currentChapter, currentParagraph },
  } = useLocationRange(300);

  // Track the state of what we've sent
  const contextStateRef = useRef<BookContextState>({ lastSentLocation: null, sentChunks: [] });

  // Flag to prevent multiple simultaneous context updates
  const isUpdatingContextRef = useRef(false);

  /**
   * Send book context chunks to the RealtimeClient
   */
  const sendBookContext = useCallback(
    async (chunks: BookContextChunk[], isInitial = false) => {
      if (!client || !isConnected || chunks.length === 0) return;

      // Check if client is actually connected
      if (!client.isConnected()) {
        console.warn("RealtimeClient is not connected, skipping book context send");
        return;
      }

      try {
        // Combine all chunks into a single context message
        const contextText = chunks.map((chunk) => `${chunk.text}`).join("\n\n");

        const messageType = isInitial ? "Initial book context" : "Additional book context";
        const fullMessage = `${messageType} \n\n${contextText}`;

        console.log(`Sending ${messageType.toLowerCase()} to RealtimeClient:`, { chunksCount: chunks.length, firstChunk: chunks[0], lastChunk: chunks[chunks.length - 1] });

        // Send the context as a user message to the conversation
        client.realtime.send("conversation.item.create", { item: { type: "message", role: "user", content: [{ type: "input_text", text: fullMessage }] } });

        // Update our tracking state
        contextStateRef.current.sentChunks.push(...chunks);
        if (chunks.length > 0) {
          const lastChunk = chunks[chunks.length - 1];
          contextStateRef.current.lastSentLocation = { chapter: lastChunk.chapter, paragraph: lastChunk.paragraph };
        }
      } catch (error) {
        console.error("Error sending book context:", error);
        // If the error is about connection, reset our state so we can try again
        if (error instanceof Error && error.message.includes("not connected")) {
          console.log("Resetting book context state due to connection error");
          contextStateRef.current = { lastSentLocation: null, sentChunks: [] };
        }
      }
    },
    [client, isConnected],
  );

  /**
   * Send initial book context when first connecting
   */
  const sendInitialContext = useCallback(async () => {
    if (!client || !isConnected || isUpdatingContextRef.current) return;

    isUpdatingContextRef.current = true;

    try {
      console.log("Sending initial book context up to:", { currentChapter, currentParagraph });

      const { chunks } = await extractBookTextUpToLocation({ chapter: currentChapter, paragraph: currentParagraph });

      if (chunks.length > 0) {
        await sendBookContext(chunks, true);
      }
    } catch (error) {
      console.error("Error sending initial book context:", error);
    } finally {
      isUpdatingContextRef.current = false;
    }
  }, [client, isConnected, currentChapter, currentParagraph, sendBookContext]);

  /**
   * Send incremental context updates when location advances
   */
  const sendIncrementalContext = useCallback(async () => {
    if (!client || !isConnected || isUpdatingContextRef.current) return;

    const lastSent = contextStateRef.current.lastSentLocation;
    if (!lastSent) return;

    const currentLocation = { chapter: currentChapter, paragraph: currentParagraph };

    // Check if we've moved forward
    const hasAdvanced = currentLocation.chapter > lastSent.chapter || (currentLocation.chapter === lastSent.chapter && currentLocation.paragraph > lastSent.paragraph);

    if (!hasAdvanced) return;

    isUpdatingContextRef.current = true;

    try {
      console.log("Sending incremental book context from:", lastSent, "to:", currentLocation);

      // Calculate the next paragraph to start from
      const fromLocation: BookContextLocation = { chapter: lastSent.chapter, paragraph: lastSent.paragraph + 1 };

      // If we've moved to a new chapter, start from paragraph 1 of the next chapter
      if (currentLocation.chapter > lastSent.chapter) {
        fromLocation.chapter = lastSent.chapter + 1;
        fromLocation.paragraph = 1;
      }

      const { chunks } = await extractBookTextFromLocation(fromLocation, currentLocation);

      if (chunks.length > 0) {
        await sendBookContext(chunks, false);
      }
    } catch (error) {
      console.error("Error sending incremental book context:", error);
    } finally {
      isUpdatingContextRef.current = false;
    }
  }, [client, isConnected, currentChapter, currentParagraph, sendBookContext]);

  // Send initial context when first connecting
  useEffect(() => {
    if (client && isConnected && !contextStateRef.current.lastSentLocation) {
      // Small delay to ensure the connection is fully established
      const timer = setTimeout(() => {
        sendInitialContext();
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [client, isConnected, sendInitialContext]);

  // Send incremental updates when location changes
  useEffect(() => {
    if (client && isConnected && contextStateRef.current.lastSentLocation) {
      // Small delay to ensure the connection is stable and avoid rapid-fire updates
      const timer = setTimeout(() => {
        sendIncrementalContext();
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [client, isConnected, currentChapter, currentParagraph, sendIncrementalContext]);

  // Reset context state when disconnecting
  useEffect(() => {
    if (!isConnected) {
      contextStateRef.current = { lastSentLocation: null, sentChunks: [] };
      isUpdatingContextRef.current = false;
    }
  }, [isConnected]);

  return { lastSentLocation: contextStateRef.current.lastSentLocation, sentChunksCount: contextStateRef.current.sentChunks.length };
}
