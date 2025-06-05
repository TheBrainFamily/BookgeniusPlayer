import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { QUESTIONS_SERVER_WS_URL } from "@/lib/consts";

// Types for the streamed messages
type StreamMessage = { type: "stream"; content: string };

type CompleteMessage = { type: "complete"; message: string };

type WebSocketMessage = StreamMessage | CompleteMessage;

export type Message = { query: string; filter: { bookSlug: string; chapterFrom?: number; chapterTo?: number; paragraphFrom?: number; paragraphTo?: number } };

interface WebSocketContextType {
  isConnected: boolean;
  isLoading: boolean;
  connect: () => void;
  disconnect: () => void;
  sendMessage: (message: Message) => void;
  receivedMessages: { role: "user" | "assistant"; content: string }[];
  currentStreamingMessage: string;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error("useWebSocket must be used within a WebSocketProvider");
  }
  return context;
};

export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [receivedMessages, setReceivedMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [currentStreamingMessage, setCurrentStreamingMessage] = useState("");

  const socketRef = useRef<WebSocket | null>(null);
  const isFirstStreamChunkRef = useRef(true);

  // Connect to the WebSocket server
  const connect = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) return;

    try {
      // Ensure the WebSocket URL has ws:// protocol
      const wsUrl = QUESTIONS_SERVER_WS_URL;
      const socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        console.log("WebSocket connection established");
        setIsConnected(true);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WebSocketMessage;

          if (data.type === "stream") {
            setIsLoading(true);
            setCurrentStreamingMessage(data.content);

            // If this is the first chunk of a new message, add it to the messages
            if (isFirstStreamChunkRef.current) {
              setReceivedMessages((prev) => [...prev, { role: "assistant", content: data.content }]);
              isFirstStreamChunkRef.current = false;
            } else {
              // Update the last message with the new content
              setReceivedMessages((prev) => {
                const newMessages = [...prev];
                if (newMessages.length > 0) {
                  newMessages[newMessages.length - 1].content = data.content;
                }
                return newMessages;
              });
            }
          } else if (data.type === "complete") {
            setIsLoading(false);
            setCurrentStreamingMessage("");
            isFirstStreamChunkRef.current = true;
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };

      socket.onerror = (error) => {
        console.error("WebSocket error:", error);
        setIsConnected(false);
      };

      socket.onclose = () => {
        console.log("WebSocket connection closed");
        setIsConnected(false);
        setIsLoading(false);
        isFirstStreamChunkRef.current = true;
      };

      socketRef.current = socket;
    } catch (error) {
      console.error("Failed to connect to WebSocket:", error);
    }
  }, []);

  // Disconnect from the WebSocket server
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
      setIsConnected(false);
      setIsLoading(false);
      isFirstStreamChunkRef.current = true;
    }
  }, []);

  // Send a message to the WebSocket server
  const sendMessage = useCallback(
    (message: Message) => {
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        // Auto-connect if not connected
        connect();
        // Wait for connection and then send
        setTimeout(() => sendMessage(message), 500);
        return;
      }

      // Reset the first chunk flag
      isFirstStreamChunkRef.current = true;

      // Add user message to the messages list
      setReceivedMessages((prev) => [...prev, { role: "user", content: message.query }]);

      // Send the message to the server
      socketRef.current.send(JSON.stringify(message));
      setIsLoading(true);
    },
    [connect],
  );

  // Auto-connect on first render
  useEffect(() => {
    connect();

    // Cleanup on unmount
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return (
    <WebSocketContext.Provider value={{ isConnected, isLoading, connect, disconnect, sendMessage, receivedMessages, currentStreamingMessage }}>
      {children}
    </WebSocketContext.Provider>
  );
};
