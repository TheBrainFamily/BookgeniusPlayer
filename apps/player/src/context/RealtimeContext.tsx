import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { instructions } from "@player/utils/conversation_config.js";
import { ANSWERS_SERVER_URL } from "@player/lib/consts";
import { RealtimeAgent, RealtimeSession, tool } from "@openai/agents-realtime";
import { loadCharactersData, getCharactersData } from "@player/genericBookDataGetters/getCharactersData";
import { useLocation } from "@player/state/LocationContext";
import { z } from "zod";
import { getBookData } from "@player/genericBookDataGetters/getBookData";

interface RealtimeContextType {
  isConnected: boolean;
  isRecording: boolean;
  isMuted: boolean;
  connectConversation: () => Promise<void>;
  disconnectConversation: () => Promise<void>;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  toggleMute: () => void;
  sendTextMessage: (message: string) => void;
  // Allows components (e.g., BottomInput) to register their ask handler so tools can trigger it
  setAskHandler: (handler: ((query: string) => void) | null) => void;
  // Programmatically trigger an ask flow
  triggerAsk: (query: string) => void;
}

const RealtimeContext = createContext<RealtimeContextType | undefined>(undefined);

type ConversationItemSummary = { id?: string; role?: string; type?: string };

type TransportEvent =
  | { type: "input_audio_buffer.speech_started" }
  | { type: "server.input_audio_buffer.speech_started" }
  | { type: "conversation.item.created"; item?: ConversationItemSummary }
  | { type: "conversation.item.deleted"; item_id?: string; item?: ConversationItemSummary }
  | { type: "response.created" }
  | { type: string; item?: ConversationItemSummary; item_id?: string };

export const useRealtime = () => {
  const context = useContext(RealtimeContext);
  if (!context) throw new Error("useRealtime must be used within a RealtimeProvider");
  return context;
};

export const RealtimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { location } = useLocation();
  const sessionRef = useRef<RealtimeSession | null>(null);
  const agentRef = useRef<RealtimeAgent | null>(null);
  const askHandlerRef = useRef<((query: string) => void) | null>(null);
  const micPrimedRef = useRef<boolean>(false);
  const recordStartTimeRef = useRef<number | null>(null);
  const audioHeardThisRecordingRef = useRef<boolean>(false);
  const awaitingSpeechResponseRef = useRef<boolean>(false);
  const conversationItemsRef = useRef<{ id: string; role?: string; type?: string }[]>([]);

  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const toolTriggeredRef = useRef<boolean>(false);

  // No local API key; tokens are retrieved from ANSWERS_SERVER_URL on connect

  // Initialize Agent + Tool using the new SDK
  useEffect(() => {
    const getBookInformation = tool({
      name: "get_book_information",
      description: "Answers the questions about the book.",
      parameters: z.object({ question: z.string().describe("The question to answer.") }),
      execute: async ({ question }: { question: string }) => {
        // Instead of calling the server, trigger our internal ask flow
        try {
          console.log("getBookInformation (tool trigger)", question);
          toolTriggeredRef.current = true;
          if (awaitingSpeechResponseRef.current) {
            askHandlerRef.current?.(question);
          } else {
            console.warn("Ignoring tool call without preceding user speech");
          }
          // Return empty string to avoid populating the input with agent reply
          return "";
        } catch (error) {
          return { error: (error as Error).message };
        }
      },
    });

    agentRef.current = new RealtimeAgent({ name: "Reader Assistant", instructions, tools: [getBookInformation] });
  }, []);

  // Attach streaming handlers on the active session
  useEffect(() => {
    const session = sessionRef.current;
    if (!session) return;

    const onTransport = (event: TransportEvent) => {
      // Detect speech activity hints from server
      if (event.type === "input_audio_buffer.speech_started" || event.type === "server.input_audio_buffer.speech_started") {
        audioHeardThisRecordingRef.current = true;
      }

      // Track conversation items to clear history between questions
      if (event.type === "conversation.item.created") {
        const item = event.item;
        const id = item?.id;
        if (!id) return;
        conversationItemsRef.current.push({ id, role: item?.role, type: item?.type });
      } else if (event.type === "conversation.item.deleted") {
        const id = event.item_id ?? event.item?.id;
        if (id) {
          conversationItemsRef.current = conversationItemsRef.current.filter((x) => x.id !== id);
        }
      }

      if (event.type === "response.created") {
        // New response turn started; reset streaming buffer
        toolTriggeredRef.current = false;
      }
    };
    const onAgentEnd = () => {
      awaitingSpeechResponseRef.current = false;
    };

    session.on("transport_event", onTransport);
    session.on("agent_end", onAgentEnd);
    return () => {
      session.off("transport_event", onTransport);
      session.off("agent_end", onAgentEnd);
    };
  }, [sessionRef.current]);

  const connectConversation = useCallback(async () => {
    if (!agentRef.current) throw new Error("Agent not initialized");

    if (!sessionRef.current) {
      sessionRef.current = new RealtimeSession(agentRef.current, {
        model: "gpt-4o-mini-realtime-preview",
        config: { outputModalities: ["text"] },
        automaticallyTriggerResponseForMcpToolCalls: false,
      });
    }
    // Fetch ephemeral realtime token from our backend
    let token = "";
    try {
      const resp = await fetch(`${ANSWERS_SERVER_URL}/getRealtimeToken`, { credentials: "include" });
      if (resp.status === 401) {
        try {
          window.dispatchEvent(new CustomEvent("ShowAuthModal", { detail: { reason: "realtimeTokenUnauthorized" } }));
        } catch (_) {
          // ignore dispatch failures
        }
        throw new Error("Unauthorized: sign in required");
      }
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
      }
      token = await resp.text();
    } catch (e) {
      console.error("Failed to fetch realtime token", e);
      throw e;
    }
    if (!token || typeof token !== "string") throw new Error("Missing realtime token");

    const session = sessionRef.current;
    await session.connect({ apiKey: token });

    // Disable VAD and lock text-only at the server.
    try {
      session.transport.sendEvent({
        type: "session.update",
        session: { model: "gpt-4o-mini-realtime-preview", type: "realtime", output_modalities: ["text"], audio: { input: { turn_detection: null } } },
      });
    } catch {}

    // Start muted so we only stream mic during press-to-talk.
    session.mute(true);
    setIsMuted(true);
    setIsConnected(true);
  }, []);

  // Preconnect when API key becomes available to reduce first-press timing issues
  useEffect(() => {
    if (!isConnected) {
      connectConversation().catch((e) => console.warn("Realtime preconnect failed", e));
    }
  }, [isConnected, connectConversation]);

  const disconnectConversation = useCallback(async () => {
    setIsConnected(false);
    const session = sessionRef.current;
    if (!session) return;

    try {
      const result = session.close?.();
      if (result && typeof (result as PromiseLike<void>).then === "function") {
        await result;
      }
    } finally {
      sessionRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (!sessionRef.current || !isConnected) {
      await connectConversation();
    }
    const session = sessionRef.current!;
    setIsRecording(true);
    recordStartTimeRef.current = Date.now();
    audioHeardThisRecordingRef.current = false;

    try {
      session.transport.sendEvent({ type: "input_audio_buffer.clear" });
    } catch {}
    // Clear all previous conversation items (ensures independence between questions)
    try {
      const toDelete = conversationItemsRef.current.map((x) => x.id);
      for (const id of toDelete) {
        session.transport.sendEvent({ type: "conversation.item.delete", item_id: id });
      }
      if (toDelete.length) {
        conversationItemsRef.current = [];
      }
    } catch (e) {
      console.warn("Failed to clear previous conversation items", e);
    }
    // Send a guidance message every hold with dynamic character list scoped to current chapter
    try {
      await loadCharactersData().catch(() => {});
      const chars = getCharactersData();
      const currentChapter = location?.chapter ?? location?.currentChapter ?? 1;
      const inCurrent = new Set<string>();
      const inPrevious = new Set<string>();
      for (const c of chars || []) {
        const name = c.characterName;
        if (!name || !name.trim()) continue;
        const infos = c.infoPerChapter || [];
        for (const info of infos) {
          const ch = info.chapter;
          if (!ch || ch > currentChapter) continue;
          const encountered = [...(info.paragraphsWhereSpotted || []), ...(info.paragraphsWhereTalking || []), ...(info.paragraphsWhereEnters || [])];
          if (encountered.length === 0) continue;
          if (ch === currentChapter) inCurrent.add(name);
          else if (ch < currentChapter) inPrevious.add(name);
        }
      }
      // Exclude any current-chapter characters from the previous-chapters list
      for (const n of Array.from(inCurrent)) inPrevious.delete(n);
      const format = (s: Set<string>) => (s.size ? Array.from(s).slice(0, 50).join(", ") : "none");
      const text =
        `Help me with the '${getBookData().metadata.title}' by ${getBookData().metadata.author}. By using the get_book_information tool.` +
          `If I mispronounce a character's name, use following lists to guide you: ` +
          `Characters in current chapter: ${format(inCurrent)}. ` +
          format(inPrevious) !==
        "none"
          ? `Characters from previous chapters: ${format(inPrevious)}. `
          : "";
      console.log("text", text);
      session.transport.sendEvent({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text }] } });
    } catch (e) {
      console.warn("Failed to send per-hold priming message", e);
    }
    // Prime mic permission on first use to avoid missing initial speech
    try {
      if (!micPrimedRef.current && typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
        micPrimedRef.current = true;
      }
    } catch (e) {
      console.warn("Microphone permission not granted", e);
    }
    session.mute(false);
    setIsMuted(false);
  }, [isConnected, connectConversation, location]);

  const stopRecording = useCallback(async () => {
    setIsRecording(false);
    const session = sessionRef.current;
    if (!session) throw new Error("Realtime session is not initialized");

    session.mute(true);
    setIsMuted(true);
    try {
      session.transport.sendEvent({ type: "input_audio_buffer.commit" });
    } catch {}
    // Only allow the upcoming tool call to trigger our ask flow if we actually captured speech
    const recStart = recordStartTimeRef.current ?? 0;
    const recDuration = Date.now() - recStart;
    const hadAudio = audioHeardThisRecordingRef.current || recDuration > 700; // fallback threshold
    awaitingSpeechResponseRef.current = !!hadAudio;
    recordStartTimeRef.current = null;
    audioHeardThisRecordingRef.current = false;
    session.transport.sendEvent({ type: "response.create", response: { output_modalities: ["text"], tool_choice: "required" } });
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      try {
        sessionRef.current?.mute(next);
      } catch {}
      return next;
    });
  }, []);

  const sendTextMessage = useCallback((message: string) => {
    const session = sessionRef.current;
    if (!session) throw new Error("Realtime session is not initialized");
    if (message.trim()) session.sendMessage(message.trim(), {});
  }, []);

  const setAskHandler = useCallback((handler: ((query: string) => void) | null) => {
    askHandlerRef.current = handler ?? null;
  }, []);

  const triggerAsk = useCallback((query: string) => {
    askHandlerRef.current?.(query);
  }, []);

  const value: RealtimeContextType = {
    isConnected,
    isRecording,
    isMuted,
    connectConversation,
    disconnectConversation,
    startRecording,
    stopRecording,
    toggleMute,
    sendTextMessage,
    setAskHandler,
    triggerAsk,
  };

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
};
