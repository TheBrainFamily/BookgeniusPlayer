/**
 * NativeShellContext
 *
 * Receives state updates from the web player running in WebView.
 * The web player sends postMessage with background URLs, music URLs,
 * and character states, which this context distributes to native components.
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";

// Types matching the web player's NativeShellContext
export interface BackgroundUpdate {
  url: string;
  chapterStart: number;
  paragraphStart: number;
  chapterEnd: number;
  paragraphEnd: number;
}

export interface MusicUpdate {
  url: string | null;
  isPlaying: boolean;
  volume: number;
  chapterStart: number;
  paragraphStart: number;
  chapterEnd: number;
  paragraphEnd: number;
}

export interface CharacterState {
  slug: string;
  name: string;
  avatarUrl: string;
  isSpeaking: boolean;
  isListening: boolean;
}

export interface CharacterStateUpdate {
  characters: CharacterState[];
  currentChapter: number;
  currentParagraph: number;
}

interface NativeShellContextType {
  background: BackgroundUpdate | null;
  music: MusicUpdate | null;
  characterState: CharacterStateUpdate | null;
  isWebPlayerReady: boolean;
  setBackground: (update: BackgroundUpdate) => void;
  setMusic: (update: MusicUpdate) => void;
  setCharacterState: (update: CharacterStateUpdate) => void;
  setWebPlayerReady: (ready: boolean) => void;
}

const NativeShellContext = createContext<NativeShellContextType | null>(null);

interface NativeShellProviderProps {
  children: ReactNode;
}

export function NativeShellProvider({ children }: NativeShellProviderProps) {
  const [background, setBackgroundState] = useState<BackgroundUpdate | null>(null);
  const [music, setMusicState] = useState<MusicUpdate | null>(null);
  const [characterState, setCharacterStateState] = useState<CharacterStateUpdate | null>(null);
  const [isWebPlayerReady, setWebPlayerReady] = useState(false);

  const setBackground = useCallback((update: BackgroundUpdate) => {
    console.log("[NativeShell] Background update:", update.url);
    setBackgroundState(update);
  }, []);

  const setMusic = useCallback((update: MusicUpdate) => {
    console.log("[NativeShell] Music update:", update.url, "playing:", update.isPlaying);
    setMusicState(update);
  }, []);

  const setCharacterState = useCallback((update: CharacterStateUpdate) => {
    console.log(
      "[NativeShell] Character state update:",
      update.characters.length,
      "characters at",
      update.currentChapter,
      ":",
      update.currentParagraph,
    );
    setCharacterStateState(update);
  }, []);

  const value = useMemo(
    () => ({
      background,
      music,
      characterState,
      isWebPlayerReady,
      setBackground,
      setMusic,
      setCharacterState,
      setWebPlayerReady,
    }),
    [
      background,
      music,
      characterState,
      isWebPlayerReady,
      setBackground,
      setMusic,
      setCharacterState,
    ],
  );

  return <NativeShellContext.Provider value={value}>{children}</NativeShellContext.Provider>;
}

export function useNativeShell() {
  const context = useContext(NativeShellContext);
  if (!context) {
    throw new Error("useNativeShell must be used within a NativeShellProvider");
  }
  return context;
}

// Hook for components that only need background state
export function useNativeBackground() {
  const { background } = useNativeShell();
  return background;
}

// Hook for components that only need music state
export function useNativeMusic() {
  const { music } = useNativeShell();
  return music;
}

// Hook for components that only need character state
export function useNativeCharacters() {
  const { characterState } = useNativeShell();
  return characterState;
}
