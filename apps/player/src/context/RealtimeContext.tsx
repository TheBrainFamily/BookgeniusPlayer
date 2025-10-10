import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { instructions } from "@player/utils/conversation_config.js";
import { RealtimeAgent, RealtimeSession, tool } from "@openai/agents-realtime";
import { loadCharactersData, getCharactersData } from "@player/genericBookDataGetters/getCharactersData";
import { useLocation } from "@player/state/LocationContext";
import { z } from "zod";
import { getBookData } from "@player/genericBookDataGetters/getBookData";
import { useLocationRange } from "@player/hooks/useLocationRange";
import { extractBookTextFromLocation, extractBookTextUpToLocation } from "@player/utils/extractBookText";
import type { BookContextLocation, BookContextChunk } from "@player/types/bookContext";
import { getSavedLocation } from "@player/helpers/paragraphsNavigation";
import { getSurroundingText } from "@player/utils/getSurroundingText";

interface RealtimeContextType {
  isConnected: boolean;
  isRecording: boolean;
  isMuted: boolean;
  isSessionReady: boolean;
  audioAnalyser: AnalyserNode | null;
  connectConversation: () => Promise<void>;
  disconnectConversation: () => Promise<void>;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  // Prime microphone once (request permission, create analyser, keep stream alive but disabled)
  primeMicrophone: () => Promise<"already_primed" | "just_primed" | "failed">;
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
  | { type: "conversation.item.added"; item?: ConversationItemSummary }
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
  const { debouncedLocation } = useLocationRange(300);
  const audioResponses = (() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get("audioResponses") === "true";
    } catch {
      return false;
    }
  })();
  const sessionRef = useRef<RealtimeSession | null>(null);
  const agentRef = useRef<RealtimeAgent | null>(null);
  const askHandlerRef = useRef<((query: string) => void) | null>(null);
  const micPrimedRef = useRef<boolean>(false);
  const recordStartTimeRef = useRef<number | null>(null);
  const audioHeardThisRecordingRef = useRef<boolean>(false);
  const awaitingSpeechResponseRef = useRef<boolean>(false);
  const conversationItemsRef = useRef<{ id: string; role?: string; type?: string }[]>([]);

  // Persistent book context tracking (Option B)
  const bookContextLastSentRef = useRef<BookContextLocation | null>(null);
  const isUpdatingBookContextRef = useRef<boolean>(false);

  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isSessionReady, setIsSessionReady] = useState(false);
  const [audioAnalyser, setAudioAnalyser] = useState<AnalyserNode | null>(null);
  const toolTriggeredRef = useRef<boolean>(false);
  const nextConnectInteractiveRef = useRef<boolean>(false);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // Reuse app's shared AudioContext from the crossfader to reduce Safari glitches
  // and avoid creating/resuming multiple contexts when the mic starts.
  const getSharedAudioContext = useCallback(async () => {
    try {
      const mod = await import("@player/audio-crossfader");
      // Ensure the shared AudioContext exists and is running
      if (typeof mod.initAudioContext === "function") {
        await mod.initAudioContext();
      }
      if (typeof mod.getAudioContext === "function") {
        const ctx = mod.getAudioContext();
        if (ctx) return ctx;
      }
    } catch (e) {
      // Fallback: create a local context if crossfader isn't initialized yet
    }
    const Ctx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    return audioContextRef.current ?? new Ctx();
  }, []);

  // No local API key; tokens are retrieved from ANSWERS_SERVER_URL on connect

  // Initialize Agent + Tool using the new SDK
  useEffect(() => {
    let toolsArr: ReturnType<typeof tool>[] = [];
    if (!audioResponses) {
      const getBookInformation = tool({
        name: "get_book_information",
        description: "Answers the questions about the book.",
        parameters: z.object({ question: z.string().describe("The question to answer.") }),
        execute: async ({ question }: { question: string }) => {
          try {
            toolTriggeredRef.current = true;
            if (awaitingSpeechResponseRef.current) {
              askHandlerRef.current?.(question);
            } else {
              console.warn("Ignoring tool call without preceding user speech");
            }
            return "";
          } catch (error) {
            return { error: (error as Error).message };
          }
        },
      });
      toolsArr = [getBookInformation];
    }

    agentRef.current = new RealtimeAgent({ name: "Reader Assistant", instructions, tools: toolsArr });
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
      if (event.type === "conversation.item.added" || event.type === "conversation.item.created") {
        setIsSessionReady(true);

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
        model: "gpt-realtime-mini",
        config: { outputModalities: audioResponses ? ["text", "audio"] : ["text"] },
        automaticallyTriggerResponseForMcpToolCalls: false,
      });
    }
    // Fetch ephemeral realtime token from our backend
    let token = "";
    try {
      const resp = await fetch(`/api/generate-realtime-token`, { credentials: "include" });
      if (resp.status === 401) {
        if (nextConnectInteractiveRef.current) {
          try {
            window.dispatchEvent(new CustomEvent("ShowAuthModal", { detail: { reason: "realtimeTokenUnauthorized" } }));
          } catch (_) {
            // ignore dispatch failures
          }
        } else {
          console.warn("Realtime preconnect unauthorized; deferring auth prompt until interaction");
        }
        throw new Error("Unauthorized: sign in required");
      }
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
      }
      token = await resp.text();
    } catch (e) {
      console.warn("Failed to fetch realtime token", e);
      throw e;
    }
    if (!token || typeof token !== "string") throw new Error("Missing realtime token");

    const session = sessionRef.current;
    await session.connect({ apiKey: token });

    // Disable VAD and lock text-only at the server.
    try {
      session.transport.sendEvent({
        type: "session.update",
        session: { model: "gpt-realtime-mini", type: "realtime", output_modalities: audioResponses ? ["text", "audio"] : ["text"], audio: { input: { turn_detection: null } } },
      });
    } catch {}

    // Start muted so we only stream mic during press-to-talk.
    session.mute(true);
    setIsMuted(true);
    setIsConnected(true);
  }, [audioResponses]);

  // Optional preconnect: disabled until mic is primed to ensure we attach our MediaStream
  useEffect(() => {
    const attemptPreconnect = async () => {
      if (isConnected) return;

      // Check if microphone permission was already granted
      let hasPermission = false;
      if (typeof navigator !== "undefined" && navigator.permissions?.query) {
        try {
          const result = await navigator.permissions.query({ name: "microphone" as PermissionName });
          hasPermission = result.state === "granted";
        } catch (error) {
          // permissions.query not supported or failed, skip preconnect
          return;
        }
      }

      // Only preconnect if we already have primed mic (so we can pass mediaStream)
      if (hasPermission && micPrimedRef.current) {
        connectConversation().catch((e) => console.warn("Realtime preconnect failed", e));
      }
    };

    attemptPreconnect();
  }, [isConnected, connectConversation]);

  // ------------------------------
  // Persistent Book Context (Option B)
  // ------------------------------
  const hasAdvancedBeyond = (a: BookContextLocation | null, b: BookContextLocation): boolean => {
    if (!a) return true;
    return b.chapter > a.chapter || (b.chapter === a.chapter && b.paragraph > a.paragraph);
  };

  const sendBookContext = useCallback(
    async (chunks: BookContextChunk[], isInitial: boolean) => {
      if (!isConnected || !sessionRef.current || !chunks.length) return;
      const session = sessionRef.current;
      const contextText = chunks.map((c) => c.text).join("\n\n");
      const header = isInitial ? "Book context so far:" : "Additional book context:";
      const text = `${header}\n\n${contextText}`;
      session.transport.sendEvent({ type: "conversation.item.create", item: { type: "message", role: "system", content: [{ type: "input_text", text }] } });
      const last = chunks[chunks.length - 1];
      bookContextLastSentRef.current = { chapter: last.chapter, paragraph: last.paragraph };
    },
    [isConnected],
  );

  const sendInitialBookContext = useCallback(async () => {
    if (!audioResponses) return;
    console.log("sendInitialBookContext");
    if (!isConnected || !sessionRef.current || isUpdatingBookContextRef.current) return;
    console.log("sendInitialBookContext 2");
    isUpdatingBookContextRef.current = true;
    try {
      const current: BookContextLocation = {
        chapter: debouncedLocation.currentChapter ?? debouncedLocation.chapter,
        paragraph: debouncedLocation.currentParagraph ?? debouncedLocation.paragraph,
      };
      const { chunks } = await extractBookTextUpToLocation(current);
      if (chunks.length) await sendBookContext(chunks, true);
    } catch (e) {
      console.warn("Failed to send initial book context", e);
    } finally {
      isUpdatingBookContextRef.current = false;
    }
  }, [isConnected, debouncedLocation.currentChapter, debouncedLocation.currentParagraph, debouncedLocation.chapter, debouncedLocation.paragraph, sendBookContext]);

  const sendIncrementalBookContext = useCallback(async () => {
    if (!audioResponses) return;
    console.log("sendIncrementalBookContext");
    if (!isConnected || !sessionRef.current || isUpdatingBookContextRef.current) return;
    console.log("sendIncrementalBookContext 2");
    const last = bookContextLastSentRef.current;
    if (!last) return;
    console.log("sendIncrementalBookContext 3");
    const current: BookContextLocation = {
      chapter: debouncedLocation.currentChapter ?? debouncedLocation.chapter,
      paragraph: debouncedLocation.currentParagraph ?? debouncedLocation.paragraph,
    };
    if (!hasAdvancedBeyond(last, current)) return;

    isUpdatingBookContextRef.current = true;
    try {
      const from: BookContextLocation = { chapter: last.chapter, paragraph: last.paragraph + 1 };
      if (current.chapter > last.chapter) {
        from.chapter = last.chapter + 1;
        from.paragraph = 1;
      }
      const { chunks } = await extractBookTextFromLocation(from, current);
      if (chunks.length) await sendBookContext(chunks, false);
    } catch (e) {
      console.warn("Failed to send incremental book context", e);
    } finally {
      isUpdatingBookContextRef.current = false;
    }
  }, [isConnected, debouncedLocation.currentChapter, debouncedLocation.currentParagraph, debouncedLocation.chapter, debouncedLocation.paragraph, sendBookContext]);

  // Kick off initial context once connected
  useEffect(() => {
    if (audioResponses && isConnected && !bookContextLastSentRef.current) {
      const t = setTimeout(() => {
        void sendInitialBookContext();
      }, 50);
      return () => clearTimeout(t);
    }
  }, [audioResponses, isConnected, sendInitialBookContext]);

  // Send incremental context as the reader advances
  useEffect(() => {
    if (audioResponses && isConnected && bookContextLastSentRef.current) {
      const t = setTimeout(() => {
        void sendIncrementalBookContext();
      }, 350);
      return () => clearTimeout(t);
    }
  }, [audioResponses, isConnected, debouncedLocation.currentChapter, debouncedLocation.currentParagraph, sendIncrementalBookContext]);

  const disconnectConversation = useCallback(async () => {
    setIsConnected(false);
    const session = sessionRef.current;
    if (!session) return;

    session.close();
    sessionRef.current = null;
    // Reset book context progress (but we do not purge server-side items)
    bookContextLastSentRef.current = null;
  }, []);

  // Prime microphone once: request permission, set up analyser, keep stream alive (tracks disabled)
  const primeMicrophone = useCallback(async (): Promise<"already_primed" | "just_primed" | "failed"> => {
    if (micPrimedRef.current && micStreamRef.current) return "already_primed";
    try {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return "failed";

      // Request mic. Keep it alive to avoid repeated hardware acquisition/permission prompts.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      // Disable tracks by default when idle (we'll enable during hold-to-speak)
      for (const track of stream.getAudioTracks()) track.enabled = false;

      // Build or reuse a single analyser using the shared AudioContext
      const sharedCtx = await getSharedAudioContext();
      audioContextRef.current = sharedCtx;
      const analyser = sharedCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;

      // Connect the stream to analyser
      const source = mediaStreamSourceRef.current ?? sharedCtx.createMediaStreamSource(stream);
      mediaStreamSourceRef.current = source;
      try {
        source.connect(analyser);
      } catch {
        // ignore if already connected
      }
      setAudioAnalyser(analyser);

      micPrimedRef.current = true;
      // Preconnect the realtime session now so the SDK can allocate audio resources once
      // (while we're already handling the first Safari drop), keeping mic muted.
      if (!isConnected) {
        nextConnectInteractiveRef.current = true;
        try {
          await connectConversation();
        } finally {
          nextConnectInteractiveRef.current = false;
        }
      }
      return "just_primed";
    } catch (e) {
      console.warn("Microphone permission not granted / failed to prime mic", e);
      return "failed";
    }
  }, [getSharedAudioContext, connectConversation, isConnected]);

  const startRecording = useCallback(async () => {
    setIsSessionReady(false);
    if (!sessionRef.current || !isConnected) {
      nextConnectInteractiveRef.current = true;
      try {
        await connectConversation();
      } finally {
        nextConnectInteractiveRef.current = false;
      }
    }

    // Ensure mic is primed exactly once; enable tracks for this recording
    const primeResult = await primeMicrophone();
    if (primeResult === "failed") {
      // Do not proceed if we cannot get mic
      throw new Error("Unable to access microphone");
    }

    // Enable mic tracks for active hold
    for (const track of micStreamRef.current?.getAudioTracks() ?? []) track.enabled = true;
    //@ts-expect-error(this is correct typing for the navigator.mediaSession.setMicrophoneActive method)
    if (typeof navigator.mediaSession?.setMicrophoneActive === "function") {
      //@ts-expect-error(this is correct typing for the navigator.mediaSession.setMicrophoneActive method)
      navigator.mediaSession.setMicrophoneActive(true);
    }
    const session = sessionRef.current!;
    session.mute(false);
    setIsMuted(false);
    setIsRecording(true);
    recordStartTimeRef.current = Date.now();
    audioHeardThisRecordingRef.current = false;

    try {
      session.transport.sendEvent({ type: "input_audio_buffer.clear" });
    } catch {}
    // Do not clear conversation items between requests — keep continuity
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

      const book = getBookData();
      const title = book?.metadata?.title ?? "the book";
      const author = book?.metadata?.author ?? "the author";
      const segments = [
        `Help the user with "${title}" by ${author}.`,
        ...(audioResponses ? [] : ["Use the get_book_information tool for every answer."]),
        "If user mispronounces a character's name, rely on these lists:",
        `Characters in current chapter: ${format(inCurrent)}.`,
      ];

      if (inPrevious.size > 0) {
        segments.push(`Characters from previous chapters: ${format(inPrevious)}.`);
      }

      if (!audioResponses) {
        segments.push(
          `Use the user’s voice question directly when calling the tool; do not add any other information or the characters or the book information like title, or author unless explicitly specified by the user. Just pass the question from the user. Use the list only to guide understanding of the pronunciation.`,
        );
      }

      const text = segments.join(" ");
      session.transport.sendEvent({ type: "conversation.item.create", item: { type: "message", role: "system", content: [{ type: "input_text", text }] } });
    } catch (e) {
      console.warn("Failed to send per-hold priming message", e);
    }
    // If user is currently looking behind the furthest read location, add a VisibleText context (audio mode only)
    if (audioResponses) {
      try {
        const saved = getSavedLocation();
        const furthestChapter = saved?.currentChapter ?? location?.currentChapter ?? 1;
        const furthestParagraph = saved?.currentParagraph ?? location?.currentParagraph ?? 1;
        const isBehind =
          (location?.currentChapter ?? 1) < furthestChapter || ((location?.currentChapter ?? 1) === furthestChapter && (location?.currentParagraph ?? 1) < furthestParagraph);
        if (isBehind) {
          const visibleText = getSurroundingText(location);
          const msg = `The user is currently looking at:\n<VisibleText>${visibleText}</VisibleText>`;
          session.transport.sendEvent({ type: "conversation.item.create", item: { type: "message", role: "system", content: [{ type: "input_text", text: msg }] } });
        }
      } catch (e) {
        console.warn("Failed to send visible text context", e);
      }
    }
    // Prime mic permission on first use to avoid missing initial speech
  }, [isConnected, connectConversation, location]);

  const stopRecording = useCallback(async () => {
    setIsRecording(false);
    const session = sessionRef.current;
    if (!session) throw new Error("Realtime session is not initialized");

    // Keep mic stream alive to avoid re-permission and Safari audio glitches,
    // but disable tracks while idle so no audio is captured.
    for (const track of micStreamRef.current?.getAudioTracks() ?? []) track.enabled = false;
    //@ts-expect-error(this is correct typing for the navigator.mediaSession.setMicrophoneActive method)
    if (typeof navigator.mediaSession?.setMicrophoneActive === "function") {
      //@ts-expect-error(this is correct typing for the navigator.mediaSession.setMicrophoneActive method)
      navigator.mediaSession.setMicrophoneActive(false);
    }
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
    session.transport.sendEvent({
      type: "response.create",
      response: { output_modalities: audioResponses ? ["text", "audio"] : ["text"], tool_choice: audioResponses ? "auto" : "required" },
    });
  }, [audioResponses]);

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
    isSessionReady,
    audioAnalyser,
    connectConversation,
    disconnectConversation,
    primeMicrophone,
    startRecording,
    stopRecording,
    toggleMute,
    sendTextMessage,
    setAskHandler,
    triggerAsk,
  };

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
};
