import React, { useState, useEffect, useRef } from "react";
import { Mic, Send } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useRealtime } from "../context/RealtimeContext";
import { Message, useWebSocket } from "../context/WebSocketContext";
import { usePage } from "../context/PageContext";
import { getCurrentBookSlug } from "../getCurrentBookSlug";

interface BottomInputProps {
  placeholder?: string;
  onSubmit?: (message: Message) => void;
  className?: string;
}

export function BottomInput({ placeholder = "Type something...", onSubmit, className }: BottomInputProps) {
  const [value, setValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const { startRecording, stopRecording, response } = useRealtime();
  const { receivedMessages, isLoading, currentStreamingMessage } = useWebSocket();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { currentPage } = usePage();
  // New state: store the last sent user message
  const [lastSentUserMessage, setLastSentUserMessage] = useState<{ role: "user"; content: string } | null>(null);

  // Handle recording response
  useEffect(() => {
    if (response && !isRecording) {
      setValue(response);
    }
  }, [response, isRecording]);

  // Prepare streaming message as object if available
  const streamingMessage = currentStreamingMessage
    ? typeof currentStreamingMessage === "string"
      ? { role: "assistant", content: currentStreamingMessage }
      : currentStreamingMessage
    : null;
  const verifiedMessages = receivedMessages.filter((m) => typeof m !== "string") as {
    role: "user" | "assistant";
    content: string;
  }[];

  // Get only the most recent user message and AI response, prioritizing a freshly sent user message
  const recentMessages = (() => {
    if (lastSentUserMessage) {
      return [lastSentUserMessage];
    }
    if (streamingMessage) {
      const lastUser = [...verifiedMessages].reverse().find((m) => m.role === "user");
      return lastUser ? [lastUser, streamingMessage] : [streamingMessage];
    }
    if (verifiedMessages.length > 0) {
      const lastMessage = verifiedMessages[verifiedMessages.length - 1];
      if (lastMessage.role === "user") {
        return [lastMessage];
      } else if (lastMessage.role === "assistant") {
        const lastUser = [...verifiedMessages]
          .slice(0, -1)
          .reverse()
          .find((m) => m.role === "user");
        return lastUser ? [lastUser, lastMessage] : [lastMessage];
      }
    }
    return [];
  })();

  // Clear lastSentUserMessage when it appears in receivedMessages
  useEffect(() => {
    if (lastSentUserMessage) {
      const userMessages = receivedMessages.filter((m) => typeof m !== "string") as {
        role: "user" | "assistant";
        content: string;
      }[];
      const lastUser = [...userMessages].reverse().find((m) => m.role === "user");
      if (lastUser && lastUser.content === lastSentUserMessage.content) {
        setLastSentUserMessage(null);
      }
    }
  }, [receivedMessages, lastSentUserMessage]);

  // When a new message is submitted, scroll to top
  const scrollToTop = () => {
    const messagesContainer = document.querySelector(".messages-container");
    if (messagesContainer) {
      messagesContainer.scrollTop = 0;
    }
  };

  // Auto-scroll when messages change
  useEffect(() => {
    scrollToTop();
  }, [receivedMessages, isLoading]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (value.trim() && onSubmit) {
      onSubmit({ query: value, filter: { pageFrom: 1, pageTo: currentPage, bookSlug: getCurrentBookSlug() } });
      // Set the pending user message to immediately update the UI
      setLastSentUserMessage({ role: "user", content: value });
      setValue("");
      // Force scroll to top when submitting
      setTimeout(scrollToTop, 100);
    }
  };

  // Handle recording start
  const handleRecordingStart = () => {
    setIsRecording(true);

    startRecording().catch((error) => {
      console.error("Error starting recording:", error);
      setIsRecording(false);
    });
  };

  // Handle recording end
  const handleRecordingEnd = () => {
    setIsRecording(false);

    stopRecording().catch((error) => {
      console.error("Error stopping recording:", error);
    });
  };

  return (
    <>
      {/* Message bubbles - now positioned at the top and expanding downward */}
      <div
        style={{ paddingTop: "calc(1rem + 2 * env(safe-area-inset-top, 0px))" }}
        className={`fixed top-0 left-0 right-0 max-h-[calc(100vh-120px)] overflow-y-auto pb-2 z-50 transition-all duration-500 ease-in-out messages-container ${
          isFocused ? "opacity-100 backdrop-blur-sm" : "opacity-0 backdrop-blur-none pointer-events-none"
        }`}
      >
        <div className="max-w-4xl mx-auto px-4 flex flex-col">
          {recentMessages.map((message, index) =>
            message.role === "user" ? (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "p-3 rounded-lg mb-2 max-w-[80%] break-words",
                  message.role === "user"
                    ? "bg-primary text-primary-foreground ml-auto rounded-br-none"
                    : "bg-muted text-muted-foreground mr-auto rounded-bl-none"
                )}
              >
                {message.content}
              </motion.div>
            ) : (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-muted text-muted-foreground p-3 rounded-lg rounded-bl-none mb-2 mr-auto"
              >
                {message.content}
              </motion.div>
            )
          )}

          {/* Typing indicator when messages are streaming */}
          {isLoading && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-muted text-muted-foreground p-3 rounded-lg rounded-bl-none mb-2 mr-auto max-w-[80%]"
            >
              <div className="flex items-center">
                <div className="flex space-x-1">
                  <span
                    className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce"
                    style={{ animationDelay: "0ms" }}
                  />
                  <span
                    className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce"
                    style={{ animationDelay: "100ms" }}
                  />
                  <span
                    className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce"
                    style={{ animationDelay: "200ms" }}
                  />
                </div>
              </div>
            </motion.div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Replace the conditional backdrop with always-rendered element that transitions */}
      <div
        className={`fixed inset-0 bg-black/80 z-40 transition-all duration-300 ease-in-out ${
          isFocused ? "opacity-100 backdrop-blur-sm" : "opacity-0 backdrop-blur-none pointer-events-none"
        }`}
        onClick={() => setIsFocused(false)}
      />

      {/* Input container */}
      <div className={cn("absolute bottom-0 z-50 w-[500px] left-1/2 -translate-x-1/2 p-4 bg-white/50 rounded-2xl mx-auto content-container", className)}>
        <form
          onSubmit={handleSubmit}
          className="max-w-4xl mx-auto"
          style={{ touchAction: "none", WebkitUserSelect: "none", userSelect: "none" }}
        >
          <div className="relative flex items-center">
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onFocus={() => setIsFocused(true)}
              // onBlur={(e) => {
              //   // Only blur if not clicking inside the form
              //   if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              //     setIsFocused(false);
              //   }
              // }}
              placeholder={isRecording ? "Listening..." : placeholder}
              className={cn(
                "w-full p-3 pr-24 rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-primary transition-colors",
                isRecording && "bg-muted text-muted-foreground"
              )}
              disabled={isRecording}
            />

            <div className="absolute right-2 flex items-center space-x-1">
              {/* Push to talk button */}
              <motion.button
                type="button"
                className={cn(
                  "p-2 rounded-full flex items-center justify-center",
                  isRecording ? "bg-destructive text-destructive-foreground" : "bg-secondary text-secondary-foreground"
                )}
                style={{ touchAction: "none", WebkitUserSelect: "none", userSelect: "none" }}
                whileTap={{ scale: 0.92 }}
                onTouchStart={(e) => {
                  e.preventDefault();
                  handleRecordingStart();
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  handleRecordingEnd();
                }}
                onTouchCancel={(e) => {
                  e.preventDefault();
                  handleRecordingEnd();
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleRecordingStart();
                }}
                onMouseUp={(e) => {
                  e.preventDefault();
                  handleRecordingEnd();
                }}
                onMouseLeave={() => isRecording && handleRecordingEnd()}
                onContextMenu={(e) => e.preventDefault()}
              >
                <Mic size={18} />
              </motion.button>

              {/* Send button */}
              <motion.button
                type="button"
                className="p-2 rounded-full bg-primary text-primary-foreground flex items-center justify-center"
                style={{ touchAction: "none", WebkitUserSelect: "none", userSelect: "none" }}
                whileTap={{ scale: 0.92 }}
                onClick={() => handleSubmit()}
                disabled={!value.trim()}
              >
                <Send size={18} />
              </motion.button>
            </div>
          </div>
        </form>
      </div>
    </>
  );
}
