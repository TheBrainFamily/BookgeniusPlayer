/**
 * NativeShellContext
 *
 * Provides a flag for when the web player is running inside a React Native WebView.
 * When true:
 * - Background videos are not rendered (native layer handles them)
 * - Music is not played (native expo-audio handles it)
 * - BottomInput is hidden (native TextInput overlays it)
 * - Character sidebar is hidden (native renders it)
 * - postMessage is used to communicate state to native layer
 *
 * Usage:
 * - Set via URL param: ?nativeShell=true
 * - Components use: const isNativeShell = useNativeShell();
 */

import React, { createContext, useContext, useEffect, useCallback } from "react";

const NativeShellContext = createContext<boolean>(false);

interface NativeShellProviderProps {
  children: React.ReactNode;
  /** Override the URL-based detection */
  forceNativeShell?: boolean;
}

// Type for ReactNativeWebView
declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (data: string) => void };
  }
}

/**
 * Messages sent to React Native via postMessage
 */
export interface NativeShellMessage {
  type:
    | "BACKGROUND_UPDATE"
    | "MUSIC_UPDATE"
    | "CHARACTER_STATE_UPDATE"
    | "LOCATION_UPDATE"
    | "MODAL_OPEN"
    | "MODAL_CLOSE"
    | "READY";
  payload: unknown;
}

export interface BackgroundUpdatePayload {
  url: string;
  chapterStart: number;
  paragraphStart: number;
  chapterEnd: number;
  paragraphEnd: number;
}

export interface MusicUpdatePayload {
  url: string | null;
  isPlaying: boolean;
  volume: number;
  chapterStart: number;
  paragraphStart: number;
  chapterEnd: number;
  paragraphEnd: number;
}

export interface CharacterStatePayload {
  characters: Array<{
    slug: string;
    name: string;
    avatarUrl: string;
    isSpeaking: boolean;
    isListening: boolean;
  }>;
  currentChapter: number;
  currentParagraph: number;
}

/**
 * Send a message to React Native WebView
 */
export function sendToNativeShell<T extends NativeShellMessage["type"]>(
  type: T,
  payload?: T extends "BACKGROUND_UPDATE"
    ? BackgroundUpdatePayload
    : T extends "MUSIC_UPDATE"
      ? MusicUpdatePayload
      : T extends "CHARACTER_STATE_UPDATE"
        ? CharacterStatePayload
        : T extends "READY"
          ? { version: string }
          : T extends "MODAL_OPEN" | "MODAL_CLOSE"
            ? undefined
            : unknown,
): void {
  if (typeof window !== "undefined" && window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type, payload }));
  }
}

export function sendModalState(isOpen: boolean): void {
  sendToNativeShell(isOpen ? "MODAL_OPEN" : "MODAL_CLOSE", undefined);
}

function detectNativeShell(): boolean {
  if (typeof window === "undefined") return false;
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("nativeShell") === "true") return true;
  if (window.ReactNativeWebView) return true;
  return false;
}

export function NativeShellProvider({ children, forceNativeShell }: NativeShellProviderProps) {
  const isNativeShell = forceNativeShell ?? detectNativeShell();

  useEffect(() => {
    if (isNativeShell) {
      document.getElementById("legacy")?.classList.add("native-shell");
      const timer = setTimeout(() => {
        sendToNativeShell("READY", { version: "1.0.0" });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isNativeShell]);

  return (
    <NativeShellContext.Provider value={isNativeShell}>{children}</NativeShellContext.Provider>
  );
}

/**
 * Hook to get the current native shell setting.
 * Returns true if running inside React Native WebView.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useNativeShell(): boolean {
  return useContext(NativeShellContext);
}

/**
 * Hook to send messages to React Native.
 * Returns null if not in native shell mode.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useNativeShellMessenger() {
  const isNativeShell = useNativeShell();

  const sendBackground = useCallback(
    (payload: BackgroundUpdatePayload) => {
      if (isNativeShell) {
        sendToNativeShell("BACKGROUND_UPDATE", payload);
      }
    },
    [isNativeShell],
  );

  const sendMusic = useCallback(
    (payload: MusicUpdatePayload) => {
      if (isNativeShell) {
        sendToNativeShell("MUSIC_UPDATE", payload);
      }
    },
    [isNativeShell],
  );

  const sendCharacterState = useCallback(
    (payload: CharacterStatePayload) => {
      if (isNativeShell) {
        sendToNativeShell("CHARACTER_STATE_UPDATE", payload);
      }
    },
    [isNativeShell],
  );

  if (!isNativeShell) {
    return null;
  }

  return { sendBackground, sendMusic, sendCharacterState };
}
