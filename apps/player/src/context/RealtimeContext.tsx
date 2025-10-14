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
  audioResponses: boolean;
  connectConversation: () => Promise<void>;
  disconnectConversation: () => Promise<void>;
  startRecording: () => Promise<"local_first" | "streaming_now">;
  stopRecording: () => Promise<void>;
  // Prime microphone once (request permission, create analyser, keep stream alive but disabled)
  primeMicrophone: () => Promise<"already_primed" | "just_primed" | "failed">;
  toggleMute: () => void;
  sendTextMessage: (message: string) => void;
  // Allows components (e.g., BottomInput) to register their ask handler so tools can trigger it
  setAskHandler: (handler: ((query: string) => void) | null) => void;
  // Programmatically trigger an ask flow
  triggerAsk: (query: string) => void;
  // Debug: last captured local clip (exact PCM we send), as WAV url
  debugClipUrl: string | null;
  clearDebugClip: () => void;
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

function setMicActiveSafe(active: boolean) {
  try {
    // @ts-expect-error experimental API for iOS
    navigator.mediaSession?.setMicrophoneActive?.(active);
  } catch (e) {
    console.debug("[mic] setMicrophoneActive suppressed:", (e as Error)?.name);
  }
}

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
  const connectPromiseRef = useRef<Promise<void> | null>(null);
  const connectStartTimeRef = useRef<number | null>(null);
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
  const analyserPullGainRef = useRef<GainNode | null>(null);
  const toolTriggeredRef = useRef<boolean>(false);
  const nextConnectInteractiveRef = useRef<boolean>(false);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
  const workletLoadedRef = useRef<boolean>(false);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const scriptProcessorGainRef = useRef<GainNode | null>(null);
  const resampleBufferRef = useRef<Float32Array | null>(null);
  const pcmQueueRef = useRef<Int16Array | null>(null);
  const isStreamingAudioRef = useRef<boolean>(false);
  // First-press prerecording support
  const hasConnectedOnceRef = useRef<boolean>(false);
  const prerecordingActiveRef = useRef<boolean>(false);
  const prebufferQueueRef = useRef<Int16Array[]>([]);
  const inputClearedThisHoldRef = useRef<boolean>(false);
  const primingSentThisHoldRef = useRef<boolean>(false);
  // Debug capture of exactly what we send (24k mono Int16)
  const debugInt16CaptureRef = useRef<Int16Array[]>([]);
  const [debugClipUrl, setDebugClipUrl] = useState<string | null>(null);
  const firstHoldLocalOnlyRef = useRef<boolean>(true);
  const localRecordingPromiseRef = useRef<Promise<Blob | null> | null>(null);
  const localRecordingResolveRef = useRef<((blob: Blob | null) => void) | null>(null);
  const localMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const localMediaChunksRef = useRef<Blob[]>([]);

  // Reuse app's shared AudioContext from the crossfader to reduce Safari glitches
  // and avoid creating/resuming multiple contexts when the mic starts.
  const getSharedAudioContext = useCallback(async () => {
    console.log("getting shared audio context");
    try {
      const mod = await import("@player/audio-crossfader");
      // Ensure the shared AudioContext exists and is running
      if (typeof mod.initAudioContext === "function") {
        console.log("initing audio context");
        await mod.initAudioContext();
        console.log("audio context inited");
      }
      if (typeof mod.getAudioContext === "function") {
        console.log("getting mod audio context");
        const ctx = mod.getAudioContext();
        console.log("mod audio context finished", ctx);
        if (ctx) return ctx;
      }
    } catch (e) {
      // Fallback: create a local context if crossfader isn't initialized yet
    }
    const Ctx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    return audioContextRef.current ?? new Ctx();
  }, []);

  const ensureAudioWorklet = useCallback(async () => {
    const ctx = await getSharedAudioContext();
    if (!ctx.audioWorklet) return false;
    if (workletLoadedRef.current) return true;
    try {
      // Path from this file to worklet
      // Vite will resolve the URL at build time
      const url = new URL("../worklets/pcm-worklet.js", import.meta.url);
      await ctx.audioWorklet.addModule(url);
      workletLoadedRef.current = true;
      return true;
    } catch (e) {
      console.warn("[ptt] failed to load audio worklet, falling back to ScriptProcessor", e);
      return false;
    }
  }, [getSharedAudioContext]);

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
              return "";
            } else {
              console.warn("Ignoring tool call without preceding user speech", { question });
              return "";
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
  }, [isConnected]);

  const connectConversation = useCallback(async () => {
    if (isConnected) {
      console.log("[connect] already connected");
      return;
    }
    if (!agentRef.current) throw new Error("Agent not initialized");

    if (connectPromiseRef.current) {
      console.log("[connect] reusing in-flight connect promise");
      return connectPromiseRef.current;
    }

    connectPromiseRef.current = (async () => {
      const t0 = performance.now();
      connectStartTimeRef.current = t0;
      console.log("[connect] start at", t0.toFixed(1));

      if (!sessionRef.current) {
        console.log("[connect] creating RealtimeSession");
        sessionRef.current = new RealtimeSession(agentRef.current!, {
          model: "gpt-realtime-mini",
          config: { outputModalities: audioResponses ? ["text", "audio"] : ["text"] },
          automaticallyTriggerResponseForMcpToolCalls: false,
        });
      }

      // Fetch ephemeral realtime token from our backend
      let token = "";
      try {
        const tFetch0 = performance.now();
        console.log("[connect] fetching realtime token at", tFetch0.toFixed(1));
        const resp = await fetch(`/api/generate-realtime-token`, { credentials: "include" });
        const tFetch1 = performance.now();
        console.log("[connect] token fetch completed in", (tFetch1 - tFetch0).toFixed(1), "ms; status", resp.status);
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
        console.log("[connect] realtime token received (len)", token?.length ?? 0);
      } catch (e) {
        console.warn("[connect] Failed to fetch realtime token", e);
        throw e;
      }
      if (!token || typeof token !== "string") throw new Error("Missing realtime token");

      const session = sessionRef.current!;
      const tConn0 = performance.now();
      console.log("[connect] calling session.connect at", tConn0.toFixed(1));
      await session.connect({ apiKey: token });
      const tConn1 = performance.now();
      console.log("[connect] session.connect resolved in", (tConn1 - tConn0).toFixed(1), "ms");

      // Disable VAD and lock text-only at the server.
      try {
        session.transport.sendEvent({
          type: "session.update",
          session: { model: "gpt-realtime-mini", type: "realtime", output_modalities: audioResponses ? ["text", "audio"] : ["text"], audio: { input: { turn_detection: null } } },
        });
      } catch (e) {
        console.warn("[connect] session.update failed", e);
      }

      // Start muted so we only stream mic during press-to-talk.
      try {
        session.mute(true);
      } catch {}
      setIsMuted(true);
      setIsConnected(true);
      setIsSessionReady(true); // Mark ready as soon as connect completes
      hasConnectedOnceRef.current = true;

      const t1 = performance.now();
      console.log("[connect] finished in", (t1 - t0).toFixed(1), "ms");
    })()
      .catch((e) => {
        connectPromiseRef.current = null;
        throw e;
      })
      .finally(() => {
        connectPromiseRef.current = null;
      });

    return connectPromiseRef.current;
  }, [audioResponses, isConnected]);

  // Flush any prerecord buffer into the session once connected (if applicable)
  const flushPrebufferIfNeeded = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    if (!prerecordingActiveRef.current) return;
    try {
      if (!inputClearedThisHoldRef.current) {
        session.transport.sendEvent({ type: "input_audio_buffer.clear" });
        inputClearedThisHoldRef.current = true;
      }
      const queue = prebufferQueueRef.current;
      for (const pcm of queue) {
        if (!pcm || pcm.length === 0) continue;
        const b64 = int16ToBase64(pcm);
        session.transport.sendEvent({ type: "input_audio_buffer.append", audio: b64 });
      }
      prebufferQueueRef.current = [];
      prerecordingActiveRef.current = false;
      console.log("[ptt] prerecord buffer flushed");
    } catch (e) {
      console.warn("[ptt] failed flushing prerecord buffer", e);
    }
  }, []);

  const sendPerHoldPriming = useCallback(async () => {
    if (primingSentThisHoldRef.current) return;
    const session = sessionRef.current;
    if (!session) return;
    primingSentThisHoldRef.current = true;
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
          `Use the user’s voice question directly when calling the tool; do not add any other information or the characters or the book information like title, or author unless explicitly specified by the user. Just pass the question from the user, as verbatim as possible. Behave like a transcription model, while using the list and book metadata I shared, to guide understanding of the pronunciation.`,
        );
      }

      const text = segments.join(" ");
      session.transport.sendEvent({ type: "conversation.item.create", item: { type: "message", role: "system", content: [{ type: "input_text", text }] } });
    } catch (e) {
      console.warn("Failed to send per-hold priming message", e);
    }
    // If user is currently looking behind the furthest read location, add a VisibleText context (audio mode only)
    if (audioResponses) {
      // try {
      //   const saved = getSavedLocation();
      //   const furthestChapter = saved?.currentChapter ?? location?.currentChapter ?? 1;
      //   const furthestParagraph = saved?.currentParagraph ?? location?.currentParagraph ?? 1;
      //   const isBehind =
      //     (location?.currentChapter ?? 1) < furthestChapter || ((location?.currentChapter ?? 1) === furthestChapter && (location?.currentParagraph ?? 1) < furthestParagraph);
      //   if (isBehind) {
      const visibleText = getSurroundingText(location);
      const msg = `For context, the user is currently looking at:\n<VisibleText>${visibleText}</VisibleText> Once again. No spoilers, dont mention what happens, dont ask questions, do not say what book this is or by whom - the user already knows!`;
      session.transport.sendEvent({ type: "conversation.item.create", item: { type: "message", role: "system", content: [{ type: "input_text", text: msg }] } });
      //   }
      // } catch (e) {
      //   console.warn("Failed to send visible text context", e);
      // }
    }
  }, [audioResponses, location]);

  // Optional preconnect: disabled until mic is primed to ensure we attach our MediaStream
  useEffect(() => {
    const attemptPreconnect = async () => {
      if (isConnected) return;

      // Check if microphone permission was already granted
      let hasPermission = false;
      if (typeof navigator !== "undefined" && navigator.permissions?.query) {
        try {
          console.log("querying microphone permission");
          const result = await navigator.permissions.query({ name: "microphone" as PermissionName });
          hasPermission = result.state === "granted";
        } catch (error) {
          // permissions.query not supported or failed, skip preconnect
          return;
        }
      }

      // Only preconnect if we already have primed mic (so we can pass mediaStream)
      if (hasPermission && micPrimedRef.current) {
        // Intentionally disabled as part of first-press improvements; we'll connect on demand in startRecording
        // connectConversation().catch((e) => console.warn("Realtime preconnect failed", e));
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
        // void sendInitialBookContext();
      }, 50);
      return () => clearTimeout(t);
    }
  }, [audioResponses, isConnected, sendInitialBookContext]);

  // Send incremental context as the reader advances
  useEffect(() => {
    if (audioResponses && isConnected && bookContextLastSentRef.current) {
      const t = setTimeout(() => {
        // void sendIncrementalBookContext();
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
    connectPromiseRef.current = null;
    console.log("[connect] disconnected at", performance.now().toFixed(1));
    // Reset book context progress (but we do not purge server-side items)
    bookContextLastSentRef.current = null;
  }, []);

  // Prime microphone once: request permission, set up analyser, keep stream alive (tracks disabled)
  const primeMicrophone = useCallback(async (): Promise<"already_primed" | "just_primed" | "failed"> => {
    const t0 = performance.now();
    console.log("[mic] prime start at", t0.toFixed(1));
    if (micPrimedRef.current && micStreamRef.current) {
      console.log("[mic] already primed");
      return "already_primed";
    }
    try {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return "failed";

      // Request mic. Keep it alive to avoid repeated hardware acquisition/permission prompts.
      const isSafari = typeof navigator !== "undefined" && /Safari/.test(navigator.userAgent) && !/Chrome|CriOS|Chromium/.test(navigator.userAgent);

      const audioConstraints: MediaTrackConstraints = { echoCancellation: !isSafari, noiseSuppression: !isSafari, autoGainControl: !isSafari, ...(isSafari ? { latency: 0 } : {}) };

      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      try {
        const track = stream.getAudioTracks()[0];
        if (track?.applyConstraints) {
          await track.applyConstraints(audioConstraints);
        }
      } catch {}
      micStreamRef.current = stream;
      try {
        for (const t of stream.getAudioTracks()) {
          t.onmute = () => console.log("[mic] prime: track muted at", performance.now().toFixed(1));
          t.onunmute = () => console.log("[mic] prime: track unmuted at", performance.now().toFixed(1));
          t.onended = () => console.log("[mic] prime: track ended at", performance.now().toFixed(1));
        }
      } catch {}

      // Disable tracks by default when idle (we'll enable during hold-to-speak)
      for (const track of stream.getAudioTracks()) track.enabled = false;

      // Build or reuse a single analyser using the shared AudioContext
      const sharedCtx = await getSharedAudioContext();
      try {
        if (sharedCtx.state === "suspended") {
          console.log("[mic] resuming AudioContext");
          await sharedCtx.resume();
        }
      } catch {}
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
      // Safari quirk: attach a zero-gain sink so analyser continues to pull audio frames
      try {
        let pull = analyserPullGainRef.current;
        if (!pull) {
          pull = sharedCtx.createGain();
          pull.gain.value = 0;
          analyserPullGainRef.current = pull;
        }
        try {
          analyser.disconnect();
        } catch {}
        analyser.connect(pull);
        try {
          pull.connect(sharedCtx.destination);
        } catch {}
      } catch (sinkError) {
        console.warn("[mic] failed to wire analyser sink", sinkError);
      }
      setAudioAnalyser(analyser);

      micPrimedRef.current = true;
      const t1 = performance.now();
      console.log("[mic] prime finished in", (t1 - t0).toFixed(1), "ms");
      return "just_primed";
    } catch (e) {
      console.warn("[mic] Microphone permission not granted / failed to prime mic", e);
      return "failed";
    }
  }, [getSharedAudioContext]);

  const startRecording = useCallback(async (): Promise<"local_first" | "streaming_now"> => {
    const tPress = performance.now();
    console.log("[ptt] startRecording invoked at", tPress.toFixed(1));

    if (firstHoldLocalOnlyRef.current) {
      const primeResult = await primeMicrophone();
      if (primeResult === "failed") throw new Error("Unable to access microphone");

      const stream = micStreamRef.current;
      if (!stream) throw new Error("Microphone stream unavailable");

      if (debugClipUrl) {
        try {
          URL.revokeObjectURL(debugClipUrl);
        } catch {}
        setDebugClipUrl(null);
      }
      debugInt16CaptureRef.current = [];
      localMediaChunksRef.current = [];
      localRecordingPromiseRef.current = new Promise<Blob | null>((resolve) => {
        localRecordingResolveRef.current = resolve;
      });

      for (const track of stream.getAudioTracks()) track.enabled = true;
      setMicActiveSafe(true);

      setIsMuted(false);
      setIsRecording(true);
      if (!isConnected) setIsSessionReady(true);
      recordStartTimeRef.current = Date.now();
      audioHeardThisRecordingRef.current = false;
      awaitingSpeechResponseRef.current = false;

      const pickMimeType = () => {
        const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
        const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|Chromium/.test(ua);
        if (!("MediaRecorder" in window)) return null;
        const types = isSafari
          ? ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]
          : ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"];
        for (const type of types) {
          try {
            if (MediaRecorder.isTypeSupported(type)) return type;
          } catch {}
        }
        return null;
      };

      try {
        const mimeType = pickMimeType();
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        localMediaChunksRef.current = [];
        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) localMediaChunksRef.current.push(ev.data);
        };
        recorder.onstop = () => {
          const chunks = localMediaChunksRef.current;
          localMediaChunksRef.current = [];
          let blob: Blob | null = null;
          if (chunks.length) {
            blob = new Blob(chunks, { type: chunks[0]?.type || "audio/webm" });
            const url = URL.createObjectURL(blob);
            setDebugClipUrl(url);
          }
          localRecordingResolveRef.current?.(blob);
          localRecordingResolveRef.current = null;
          for (const track of stream.getAudioTracks()) track.enabled = false;
          setMicActiveSafe(false);
          setIsMuted(true);
          localMediaRecorderRef.current = null;
        };
        recorder.onerror = (ev) => {
          console.warn("[ptt] local MediaRecorder error", ev);
        };
        localMediaRecorderRef.current = recorder;

        // Safari stability: avoid timeslice-based start which can auto-stop recordings
        recorder.start();
      } catch (err) {
        console.error("[ptt] Failed to start local MediaRecorder", err);
        localRecordingResolveRef.current?.(null);
        localRecordingResolveRef.current = null;
        localRecordingPromiseRef.current = null;
        for (const track of stream.getAudioTracks()) track.enabled = false;
        throw err;
      }
      return "local_first";
    }

    if (!isConnected) setIsSessionReady(false);

    // Kick off connection and mic priming in parallel
    nextConnectInteractiveRef.current = true;
    const connectPromise = connectConversation().finally(() => {
      nextConnectInteractiveRef.current = false;
    });

    // Ensure mic is primed exactly once
    const primeResult = await primeMicrophone();
    if (primeResult === "failed") {
      // Do not proceed if we cannot get mic
      throw new Error("Unable to access microphone");
    }

    // Enable mic tracks immediately to start capturing locally and visualize while connecting
    for (const track of micStreamRef.current?.getAudioTracks() ?? []) track.enabled = true;
    setMicActiveSafe(true);
    // Allow a short stabilization window after enabling tracks (non-blocking)
    await new Promise((r) => setTimeout(r, 40));
    // Keep session muted; we stream audio manually via input_audio_buffer.append
    setIsMuted(false);
    setIsRecording(true);
    recordStartTimeRef.current = Date.now();
    audioHeardThisRecordingRef.current = false;

    // Setup prerecord mode only if we haven't connected at least once and are not currently connected
    prerecordingActiveRef.current = !hasConnectedOnceRef.current && !isConnected;
    inputClearedThisHoldRef.current = false;
    primingSentThisHoldRef.current = false;
    prebufferQueueRef.current = [];
    // Reset debug capture & clip URL
    debugInt16CaptureRef.current = [];
    if (debugClipUrl) {
      try {
        URL.revokeObjectURL(debugClipUrl);
      } catch {}
      setDebugClipUrl(null);
    }

    // Start capturing PCM from our mic immediately; if not connected, buffer and flush later
    try {
      const ctx = audioContextRef.current;
      const source = mediaStreamSourceRef.current;
      if (ctx && source) {
        const fromRate = ctx.sampleRate;
        const toRate = 24000;
        const ratio = fromRate / toRate;

        resampleBufferRef.current = new Float32Array(0);
        pcmQueueRef.current = new Int16Array(0);
        isStreamingAudioRef.current = true;

        const workletReady = await ensureAudioWorklet();
        if (workletReady && window.AudioWorkletNode) {
          let node = audioWorkletNodeRef.current;
          if (!node) {
            node = new window.AudioWorkletNode(ctx, "pcm-worklet", { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 1 });
            audioWorkletNodeRef.current = node;
          }
          let voicedLogged = false;
          node.port.onmessage = (e: MessageEvent) => {
            if (!isStreamingAudioRef.current) return;
            try {
              const buf = e.data as ArrayBuffer;
              const input = new Float32Array(buf);
              const prev = resampleBufferRef.current!;
              const merged = new Float32Array(prev.length + input.length);
              merged.set(prev, 0);
              merged.set(input, prev.length);

              const outCount = Math.floor(merged.length / ratio);
              if (outCount <= 0) {
                resampleBufferRef.current = merged;
                return;
              }
              const out = new Float32Array(outCount);
              for (let i = 0; i < outCount; i++) {
                const idx = i * ratio;
                const i0 = Math.floor(idx);
                const i1 = Math.min(i0 + 1, merged.length - 1);
                const frac = idx - i0;
                out[i] = merged[i0] * (1 - frac) + merged[i1] * frac;
              }
              const usedInput = Math.floor(outCount * ratio);
              resampleBufferRef.current = merged.subarray(usedInput);

              const pcm = new Int16Array(out.length);
              // detect amplitude for "we heard voice" gate
              let peak = 0;
              for (let i = 0; i < out.length; i++) {
                let s = out[i];
                s = Math.max(-1, Math.min(1, s));
                if (Math.abs(s) > peak) peak = Math.abs(s);
                pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
              }
              if (peak > 0.02) {
                if (!audioHeardThisRecordingRef.current && !voicedLogged) {
                  console.log("[ptt] detected voice; peak=", peak.toFixed(3));
                  voicedLogged = true;
                }
                audioHeardThisRecordingRef.current = true;
                awaitingSpeechResponseRef.current = true;
              }

              const prevPcm = pcmQueueRef.current!;
              const mergedPcm = new Int16Array(prevPcm.length + pcm.length);
              mergedPcm.set(prevPcm, 0);
              mergedPcm.set(pcm, prevPcm.length);
              let offset = 0;
              const CHUNK = 1200;
              while (offset + CHUNK <= mergedPcm.length) {
                const slice = mergedPcm.subarray(offset, offset + CHUNK);
                const session = sessionRef.current;
                // If prerecording, queue locally; else send immediately
                if (prerecordingActiveRef.current || !session) {
                  if (slice.length) prebufferQueueRef.current.push(slice.slice());
                } else {
                  // Ensure input buffer is cleared exactly once per hold before appending
                  if (!inputClearedThisHoldRef.current) {
                    try {
                      session.transport.sendEvent({ type: "input_audio_buffer.clear" });
                    } catch {}
                    inputClearedThisHoldRef.current = true;
                  }
                  if (slice.length) {
                    const b64 = int16ToBase64(slice);
                    try {
                      session.transport.sendEvent({ type: "input_audio_buffer.append", audio: b64 });
                    } catch {}
                  }
                }
                // Always capture to debug (clone to avoid retaining growing buffer)
                if (slice.length) debugInt16CaptureRef.current.push(slice.slice());
                offset += CHUNK;
              }
              if (offset < mergedPcm.length) {
                pcmQueueRef.current = mergedPcm.subarray(offset);
              } else {
                pcmQueueRef.current = new Int16Array(0);
              }
            } catch {}
          };
          try {
            source.connect(node);
          } catch {}
          console.log("[ptt] audio streaming started (AudioWorklet)");
        } else {
          // Fallback to ScriptProcessor if worklet unavailable
          let sp = scriptProcessorRef.current;
          if (!sp) {
            sp = ctx.createScriptProcessor(2048, 1, 1);
            scriptProcessorRef.current = sp;
          }
          let voicedLogged = false;
          sp.onaudioprocess = (ev) => {
            if (!isStreamingAudioRef.current) return;
            try {
              const input = ev.inputBuffer.getChannelData(0);
              const prev = resampleBufferRef.current!;
              const merged = new Float32Array(prev.length + input.length);
              merged.set(prev, 0);
              merged.set(input, prev.length);

              const outCount = Math.floor(merged.length / ratio);
              if (outCount <= 0) {
                resampleBufferRef.current = merged;
                return;
              }
              const out = new Float32Array(outCount);
              for (let i = 0; i < outCount; i++) {
                const idx = i * ratio;
                const i0 = Math.floor(idx);
                const i1 = Math.min(i0 + 1, merged.length - 1);
                const frac = idx - i0;
                out[i] = merged[i0] * (1 - frac) + merged[i1] * frac;
              }
              const usedInput = Math.floor(outCount * ratio);
              resampleBufferRef.current = merged.subarray(usedInput);

              const pcm = new Int16Array(out.length);
              let peak = 0;
              for (let i = 0; i < out.length; i++) {
                let s = out[i];
                s = Math.max(-1, Math.min(1, s));
                if (Math.abs(s) > peak) peak = Math.abs(s);
                pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
              }
              if (peak > 0.02) {
                if (!audioHeardThisRecordingRef.current && !voicedLogged) {
                  console.log("[ptt] detected voice; peak=", peak.toFixed(3));
                  voicedLogged = true;
                }
                audioHeardThisRecordingRef.current = true;
                awaitingSpeechResponseRef.current = true;
              }

              const prevPcm = pcmQueueRef.current!;
              const mergedPcm = new Int16Array(prevPcm.length + pcm.length);
              mergedPcm.set(prevPcm, 0);
              mergedPcm.set(pcm, prevPcm.length);
              let offset = 0;
              const CHUNK = 1200;
              while (offset + CHUNK <= mergedPcm.length) {
                const slice = mergedPcm.subarray(offset, offset + CHUNK);
                const session = sessionRef.current;
                if (prerecordingActiveRef.current || !session) {
                  if (slice.length) prebufferQueueRef.current.push(slice.slice());
                } else {
                  if (!inputClearedThisHoldRef.current) {
                    try {
                      session.transport.sendEvent({ type: "input_audio_buffer.clear" });
                    } catch {}
                    inputClearedThisHoldRef.current = true;
                  }
                  if (slice.length) {
                    const b64 = int16ToBase64(slice);
                    try {
                      session.transport.sendEvent({ type: "input_audio_buffer.append", audio: b64 });
                    } catch {}
                  }
                }
                if (slice.length) debugInt16CaptureRef.current.push(slice.slice());
                offset += CHUNK;
              }
              if (offset < mergedPcm.length) {
                pcmQueueRef.current = mergedPcm.subarray(offset);
              } else {
                pcmQueueRef.current = new Int16Array(0);
              }
            } catch {}
          };
          try {
            source.connect(sp);
          } catch {}
          try {
            let gain = scriptProcessorGainRef.current;
            if (!gain) {
              gain = ctx.createGain();
              gain.gain.value = 0;
              scriptProcessorGainRef.current = gain;
            }
            if (gain) {
              try {
                sp.disconnect();
              } catch {}
              try {
                gain.disconnect();
              } catch {}
              sp.connect(gain);
              gain.connect(ctx.destination);
            }
          } catch (e) {
            console.warn("[ptt] failed to connect ScriptProcessor gain", e);
          }
          console.log("[ptt] audio streaming started (ScriptProcessor fallback)");
        }
      }
    } catch (e) {
      console.warn("[ptt] failed to start audio streaming", e);
    }

    // Once connected, immediately flush prerecord buffer (if any) and send priming
    connectPromise
      .then(() => {
        flushPrebufferIfNeeded();
        sendPerHoldPriming();
      })
      .catch(() => {});
    // Prime mic permission on first use to avoid missing initial speech
    return "streaming_now";
  }, [isConnected, connectConversation, location, flushPrebufferIfNeeded, sendPerHoldPriming, primeMicrophone, debugClipUrl]);

  const stopRecording = useCallback(async () => {
    setIsRecording(false);

    if (firstHoldLocalOnlyRef.current) {
      let blob: Blob | null = null;
      try {
        const recorder = localMediaRecorderRef.current;
        const stopPromise = localRecordingPromiseRef.current ?? Promise.resolve<Blob | null>(null);
        if (recorder && recorder.state !== "inactive") {
          recorder.stop();
        }
        blob = await stopPromise;
      } catch (e) {
        console.warn("[ptt] failed to stop local recorder", e);
      } finally {
        localRecordingPromiseRef.current = null;
      }

      const stream = micStreamRef.current;
      if (stream) {
        for (const track of stream.getAudioTracks()) track.enabled = false;
      }
      setMicActiveSafe(false);
      setIsMuted(true);

      if (!blob || blob.size === 0) {
        firstHoldLocalOnlyRef.current = false;
        return;
      }

      try {
        nextConnectInteractiveRef.current = true;
        await (connectPromiseRef.current ?? connectConversation());
      } catch (e) {
        console.warn("[ptt] connect failed before sending local recording", e);
        firstHoldLocalOnlyRef.current = false;
        return;
      } finally {
        nextConnectInteractiveRef.current = false;
      }

      const session = sessionRef.current;
      if (!session) {
        firstHoldLocalOnlyRef.current = false;
        return;
      }

      try {
        const ctx = await getSharedAudioContext();
        const pcm = await decodeBlobToInt16(blob, 24000, ctx);
        debugInt16CaptureRef.current = pcm.length ? [pcm] : [];
        try {
          session.transport.sendEvent({ type: "input_audio_buffer.clear" });
        } catch {}
        inputClearedThisHoldRef.current = true;
        await sendPerHoldPriming().catch(() => {});

        const CHUNK = 1200;
        let offset = 0;
        while (offset < pcm.length) {
          const slice = pcm.subarray(offset, Math.min(offset + CHUNK, pcm.length));
          const b64 = int16ToBase64(slice);
          try {
            session.transport.sendEvent({ type: "input_audio_buffer.append", audio: b64 });
          } catch (err) {
            console.warn("[ptt] failed to append chunk from local recording", err);
            break;
          }
          offset += CHUNK;
        }
      } catch (e) {
        console.warn("[ptt] failed to process local recording for upload", e);
      }

      const heardAudio = debugInt16CaptureRef.current.length > 0 && debugInt16CaptureRef.current[0].length > 0;
      audioHeardThisRecordingRef.current = heardAudio;
      awaitingSpeechResponseRef.current = heardAudio;
      recordStartTimeRef.current = null;

      try {
        sessionRef.current?.transport.sendEvent({ type: "input_audio_buffer.commit" });
      } catch (e) {
        console.warn("[ptt] failed to commit local buffer", e);
      }

      try {
        sessionRef.current?.transport.sendEvent({
          type: "response.create",
          response: { output_modalities: audioResponses ? ["text", "audio"] : ["text"], tool_choice: audioResponses ? "auto" : "required" },
        });
      } catch (e) {
        console.warn("[ptt] failed to request response after local upload", e);
      }

      prerecordingActiveRef.current = false;
      primingSentThisHoldRef.current = false;
      inputClearedThisHoldRef.current = false;
      firstHoldLocalOnlyRef.current = false;
      return;
    }

    const session = sessionRef.current;

    // Stop streaming PCM
    try {
      isStreamingAudioRef.current = false;
      if (audioWorkletNodeRef.current && mediaStreamSourceRef.current) {
        try {
          mediaStreamSourceRef.current.disconnect(audioWorkletNodeRef.current);
        } catch {}
      }
      if (audioWorkletNodeRef.current) {
        try {
          audioWorkletNodeRef.current.disconnect();
        } catch {}
      }
      audioWorkletNodeRef.current = null;
      if (scriptProcessorRef.current && mediaStreamSourceRef.current) {
        try {
          mediaStreamSourceRef.current.disconnect(scriptProcessorRef.current);
        } catch {}
      }
      if (scriptProcessorRef.current) {
        try {
          scriptProcessorRef.current.disconnect();
        } catch {}
      }
      scriptProcessorRef.current = null;
      if (scriptProcessorGainRef.current) {
        try {
          scriptProcessorGainRef.current.disconnect();
        } catch {}
      }
      scriptProcessorGainRef.current = null;
      resampleBufferRef.current = null;
      pcmQueueRef.current = null;
    } catch {}

    // Keep mic stream alive to avoid re-permission and Safari audio glitches,
    // but disable tracks while idle so no audio is captured.
    for (const track of micStreamRef.current?.getAudioTracks() ?? []) track.enabled = false;
    setMicActiveSafe(false);
    try {
      sessionRef.current?.mute(true);
    } catch {}
    setIsMuted(true);
    // If we started prerecording and connection wasn't ready, wait and flush now
    if (prerecordingActiveRef.current || !isConnected) {
      try {
        await (connectPromiseRef.current ?? Promise.resolve());
      } catch {}
      flushPrebufferIfNeeded();
      sendPerHoldPriming();
    }
    // Build WAV clip from captured Int16 slices (exactly what we sent) at 24kHz mono
    try {
      const chunks = debugInt16CaptureRef.current;
      if (chunks.length) {
        const total = chunks.reduce((n, c) => n + c.length, 0);
        const merged = new Int16Array(total);
        let off = 0;
        for (const c of chunks) {
          merged.set(c, off);
          off += c.length;
        }
        const wav = encodeWavFromInt16(merged, 24000);
        const blob = new Blob([wav], { type: "audio/wav" });
        const url = URL.createObjectURL(blob);
        setDebugClipUrl(url);
      }
    } catch (e) {
      console.warn("[ptt] failed to build debug clip", e);
    }
    try {
      const tCommit = performance.now();
      console.log("[ptt] committing input buffer at", tCommit.toFixed(1));
      sessionRef.current?.transport.sendEvent({ type: "input_audio_buffer.commit" });
    } catch (e) {
      console.warn("[ptt] failed to commit input buffer", e);
    }
    // Only allow the upcoming tool call to trigger our ask flow if we actually captured speech
    const recStart = recordStartTimeRef.current ?? 0;
    const recDuration = Date.now() - recStart;
    const hadAudio = audioHeardThisRecordingRef.current || recDuration > 700; // fallback threshold
    awaitingSpeechResponseRef.current = !!hadAudio;
    recordStartTimeRef.current = null;
    audioHeardThisRecordingRef.current = false;
    inputClearedThisHoldRef.current = false;
    primingSentThisHoldRef.current = false;
    try {
      session.transport.sendEvent({
        type: "response.create",
        response: { output_modalities: audioResponses ? ["text", "audio"] : ["text"], tool_choice: audioResponses ? "auto" : "required" },
      });
      console.log("[ptt] response.create sent at", performance.now().toFixed(1));
    } catch (e) {
      console.warn("[ptt] failed to send response.create", e);
    }
  }, [audioResponses, isConnected, flushPrebufferIfNeeded, sendPerHoldPriming, getSharedAudioContext, connectConversation]);

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
    audioResponses,
    connectConversation,
    disconnectConversation,
    primeMicrophone,
    startRecording,
    stopRecording,
    toggleMute,
    sendTextMessage,
    setAskHandler,
    triggerAsk,
    debugClipUrl,
    clearDebugClip: () => {
      if (debugClipUrl) {
        try {
          URL.revokeObjectURL(debugClipUrl);
        } catch {}
      }
      setDebugClipUrl(null);
    },
  };

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
};

// Utility: convert Int16Array to base64 (browser)
function int16ToBase64(int16: Int16Array): string {
  const bytes = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(sub));
  }
  // btoa expects binary string
  return btoa(binary);
}

async function decodeBlobToInt16(blob: Blob, targetSampleRate: number, ctx: AudioContext): Promise<Int16Array> {
  if (!blob || blob.size === 0) return new Int16Array(0);
  try {
    if (ctx.state === "suspended") await ctx.resume();
  } catch {}
  const arrayBuffer = await blob.arrayBuffer();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
  if (audioBuffer.numberOfChannels === 0) return new Int16Array(0);
  const channelData = audioBuffer.getChannelData(0);
  const resampled = resampleFloat32(channelData, audioBuffer.sampleRate, targetSampleRate);
  const pcm = new Int16Array(resampled.length);
  for (let i = 0; i < resampled.length; i++) {
    let s = resampled[i];
    s = Math.max(-1, Math.min(1, s));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm;
}

function resampleFloat32(data: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (!data.length) return new Float32Array(0);
  if (fromRate === toRate) return new Float32Array(data);
  const ratio = fromRate / toRate;
  const newLength = Math.max(1, Math.floor(data.length / ratio));
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const idx = i * ratio;
    const i0 = Math.floor(idx);
    const i1 = Math.min(i0 + 1, data.length - 1);
    const frac = idx - i0;
    result[i] = data[i0] * (1 - frac) + data[i1] * frac;
  }
  return result;
}

// Utility: encode a mono 16-bit PCM Int16Array into a WAV ArrayBuffer
function encodeWavFromInt16(samples: Int16Array, sampleRate: number): ArrayBuffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");

  // fmt chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // PCM data
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    view.setInt16(offset, samples[i], true);
  }
  return buffer;
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}
