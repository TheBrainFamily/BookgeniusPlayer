import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from "react";
import { RealtimeClient } from "@openai/realtime-api-beta";

import { WavRecorder, WavStreamPlayer } from "@/lib/wavtools/index.js";
import { instructions } from "@/utils/conversation_config.js";
import { getApiKey, createApiKeyListener } from "@/utils/apiKeyManager";
import { useBookContext } from "@/hooks/useBookContext";

// Define the conversation item type
interface ConversationItem {
  id: string;
  type?: string;
  role?: string;
  status?: string;
  formatted: {
    audio?: Uint8Array | Int16Array;
    file?: { url: string };
    text?: string;
    transcript?: string;
    tool?: { name: string; arguments: string };
    output?: string;
    [key: string]: unknown;
  };
}

interface RealtimeContextType {
  isConnected: boolean;
  isRecording: boolean;
  isMuted: boolean;
  response: string;
  connectConversation: () => Promise<void>;
  disconnectConversation: () => Promise<void>;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  toggleMute: () => void;
  sendTextMessage: (message: string) => void;
}

const RealtimeContext = createContext<RealtimeContextType | undefined>(undefined);

export const useRealtime = () => {
  const context = useContext(RealtimeContext);
  if (!context) {
    throw new Error("useRealtime must be used within a RealtimeProvider");
  }
  return context;
};

export const RealtimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // if (import.meta.env.VITE_DEVELOPMENT === "true") {
  //   return <>{children}</>;
  // }
  const [apiKey, setApiKey] = useState<string>("");
  const clientRef = useRef<RealtimeClient | null>(null);
  const wavRecorderRef = useRef<WavRecorder>(new WavRecorder({ sampleRate: 24000 }));
  const wavStreamPlayerRef = useRef<WavStreamPlayer>(new WavStreamPlayer({ sampleRate: 24000 }));

  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [response, setResponse] = useState("");
  const [, setItems] = useState<ConversationItem[]>([]);

  // Use the book context hook to manage sending book content to the RealtimeClient
  useBookContext({ client: clientRef.current, isConnected });

  // Initialize API key from localStorage and listen for changes
  useEffect(() => {
    const loadApiKey = () => {
      const storedApiKey = getApiKey();
      setApiKey(storedApiKey);

      if (!storedApiKey) {
        console.warn("No OpenAI API Key, things will not work");
      } else {
        console.log("OpenAI API Key loaded successfully");
      }
    };

    // Load initial API key
    loadApiKey();

    // Set up listeners for API key changes
    const { addListeners, removeListeners } = createApiKeyListener(loadApiKey);
    addListeners();

    return removeListeners;
  }, []);

  // Initialize RealtimeClient when apiKey is available
  useEffect(() => {
    if (apiKey) {
      clientRef.current = new RealtimeClient({ apiKey: apiKey, dangerouslyAllowAPIKeyInBrowser: true });
    }
  }, [apiKey]);

  // Set up event handlers for the RealtimeClient
  useEffect(() => {
    const client = clientRef.current;
    const wavStreamPlayer = wavStreamPlayerRef.current;

    if (!client) return;

    // Set initial instructions
    client.updateSession({ instructions: instructions });
    // client.addTool(
    //   {
    //     name: "get_book_information",
    //     description: "Answers the questions about the book.",
    //     parameters: { type: "object", properties: { question: { type: "string", description: "The question to answer." } }, required: ["question"] },
    //   },
    //   async ({ question }: { question: string }) => {
    //     try {
    //       console.log("question", question);

    //       // Calculate the pageFrom and pageTo based on current page
    //       // We're using dynamic page range based on current reading position
    //       // we set the pageTo to the current page so we avoid spoilers

    //       const filter = { chapterFrom: 1, chapterTo: currentChapter, paragraphFrom: 1, paragraphTo: currentParagraph, bookSlug: CURRENT_BOOK };
    //       console.log("filter", filter);
    //       const response = await fetch(`${QUESTIONS_SERVER_URL}/ask?question=${encodeURIComponent(question)}&filter=${encodeURIComponent(JSON.stringify(filter))}`);
    //       const data = await response.text();
    //       console.log("Response from book information service:", data);
    //       return data;
    //     } catch (error) {
    //       console.log("error");
    //       return { error: (error as Error).message };
    //     }
    //   },
    // );

    client.on("error", (event: unknown) => console.error(event));

    client.on("conversation.interrupted", async () => {
      const trackSampleOffset = await wavStreamPlayer.interrupt();
      if (trackSampleOffset?.trackId) {
        const { trackId, offset } = trackSampleOffset;
        await client.cancelResponse(trackId, offset);
      }
    });

    client.on("conversation.updated", async ({ item, delta }: { item: ConversationItem; delta: { audio?: Uint8Array | Int16Array; [key: string]: unknown } }) => {
      const items = client.conversation.getItems() as ConversationItem[];

      if (delta?.audio && !isMuted) {
        wavStreamPlayer.add16BitPCM(delta.audio as Uint8Array, item.id);
      }

      if (item.status === "completed" && item.formatted.audio?.length) {
        const wavFile = await WavRecorder.decode(item.formatted.audio as Uint8Array, 24000, 24000);
        item.formatted.file = wavFile;
      }

      setItems(items);

      // Update the response text if this is an assistant message
      if (item.role === "assistant" && item.formatted.text) {
        setResponse(item.formatted.text);
      }
    });

    return () => {
      // Cleanup
      client.reset();
    };
  }, [clientRef.current, isMuted]);

  // Connect to conversation
  const connectConversation = useCallback(async () => {
    const client = clientRef.current;
    if (!client) throw new Error("RealtimeClient is not initialized");

    const wavRecorder = wavRecorderRef.current;
    const wavStreamPlayer = wavStreamPlayerRef.current;

    // Set state
    setIsConnected(true);
    setItems(client.conversation.getItems() as ConversationItem[]);
    console.log("wavRecorder.getStatus()", wavRecorder.getStatus());
    if (wavRecorder.getStatus() === "ended") {
      // Connect to microphone
      await wavRecorder.begin();
    }

    // console.log("wavStreamPlayer.getStatus()", wavStreamPlayer.getStatus());
    // if (wavStreamPlayer.getStatus() === "inactive") {
    // Connect to audio output
    await wavStreamPlayer.connect();
    // }

    // Connect to realtime API
    await client.connect();

    // Send initial message with character context
    client.realtime.send("conversation.item.create", {
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Answer questions about this book. I will provide you with the book content as context as I read through it. Use the provided book context and the get_book_information tool when needed. Absolutely no spoilers beyond what I've already read. Characters in the book: Winston, Big Brother, Julia, Parsons, O'Brien. If I mispronounce a character's name, use this list to guide you.`,
            // text: `Pomóż mi z książką. Odpowiadaj tylko na podstawie tekstu z get_book_information tool. Postacie z ksiazki to: Ksiąze Ramzes, Sara, Herhor, Dagon, Tutmozis i inni.`,
            // text: `Help me with the book. The characters are: "Chilli", "Harry", "Karen", "Catlett", "Michael", "Leo", "Tommy", "Nicki", "Fay". If I mispronounce a character's name, use this list to guide you. When I ask a question, use the get_book_information tool to answer the question.`,
          },
        ],
      },
    });
  }, []);

  // Disconnect from conversation
  const disconnectConversation = useCallback(async () => {
    setIsConnected(false);

    const client = clientRef.current;
    if (!client) throw new Error("RealtimeClient is not initialized");

    client.disconnect();

    const wavRecorder = wavRecorderRef.current;
    await wavRecorder.end();

    const wavStreamPlayer = wavStreamPlayerRef.current;
    await wavStreamPlayer.interrupt();
  }, []);

  // Start recording
  const startRecording = useCallback(async () => {
    setIsRecording(true);

    const client = clientRef.current;
    if (!client) throw new Error("RealtimeClient is not initialized");

    // If not connected yet, connect first
    if (!isConnected || !client.isConnected()) {
      await client.disconnect();
      await connectConversation();
    }

    const wavRecorder = wavRecorderRef.current;
    const wavStreamPlayer = wavStreamPlayerRef.current;

    const trackSampleOffset = await wavStreamPlayer.interrupt();
    if (trackSampleOffset?.trackId) {
      const { trackId, offset } = trackSampleOffset;
      await client.cancelResponse(trackId, offset);
    }

    await wavRecorder.record((data) => {
      client.appendInputAudio(data.mono);
    });
  }, [isConnected, connectConversation, disconnectConversation]);

  // Stop recording
  const stopRecording = useCallback(async () => {
    setIsRecording(false);

    const client = clientRef.current;
    if (!client) throw new Error("RealtimeClient is not initialized");

    const wavRecorder = wavRecorderRef.current;
    await wavRecorder.pause();
    client.createResponse();
  }, []);

  // Toggle mute
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  // Send text message
  const sendTextMessage = useCallback((message: string) => {
    const client = clientRef.current;
    if (!client) throw new Error("RealtimeClient is not initialized");

    if (message.trim()) {
      client.realtime.send("conversation.item.create", { item: { type: "message", role: "user", content: [{ type: "input_text", text: message.trim() }] } });
    }
  }, []);

  const value = { isConnected, isRecording, isMuted, response, connectConversation, disconnectConversation, startRecording, stopRecording, toggleMute, sendTextMessage };

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
};
