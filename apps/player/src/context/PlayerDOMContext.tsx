/**
 * PlayerDOMContext
 *
 * Provides access to the player's DOM elements. The player requires several
 * DOM elements for backgrounds, content, notes panels, etc.
 *
 * This context enables two modes:
 * 1. Adopt existing DOM - When HTML already has the elements (standalone player)
 * 2. Create DOM dynamically - When embedded as a component (platform, third-party)
 *
 * Usage:
 * - Wrap player with <PlayerDOMProvider>
 * - Access elements via usePlayerDOM() hook
 * - Elements are guaranteed to exist when children render
 */

import React, { createContext, useContext, useLayoutEffect, useState } from "react";
import { useNativeShell } from "./NativeShellContext";

export interface PlayerDOM {
  // Root container
  playerScope: HTMLElement;

  // Background layer
  legacy: HTMLElement;
  bgVideoA: HTMLVideoElement | null;
  bgVideoB: HTMLVideoElement | null;
  bgImageA: HTMLElement | null;
  bgImageB: HTMLElement | null;

  // Cutscene elements
  cutsceneVideo: HTMLVideoElement | null;
  cutsceneText: HTMLElement | null;

  // Content layer
  bookContainer: HTMLElement;
  leftNotes: HTMLElement;
  contentContainer: HTMLElement;
  rightNotes: HTMLElement;
  rightNotesScrollable: HTMLElement | null;

  // React mount point
  rootPlayer: HTMLElement;
}

const PlayerDOMContext = createContext<PlayerDOM | null>(null);

interface PlayerDOMProviderProps {
  children: React.ReactNode;
  /** If true, always create DOM dynamically (don't try to adopt existing) */
  forceCreate?: boolean;
}

/**
 * Try to find existing DOM elements by their IDs
 */
function findExistingDOM(): PlayerDOM | null {
  const playerScope = document.getElementById("player-scope");
  const legacy = document.getElementById("legacy");
  const bookContainer = document.getElementById("book-container");
  const contentContainer = document.getElementById("content-container");
  const leftNotes = document.getElementById("left-notes");
  const rightNotes = document.getElementById("right-notes");
  const rootPlayer = document.getElementById("root-player");

  // These are the minimum required elements
  if (!playerScope || !legacy || !bookContainer || !contentContainer || !leftNotes || !rightNotes) {
    return null;
  }

  // rootPlayer might not exist in dynamic mode - we'll create it
  const actualRootPlayer = rootPlayer || createRootPlayer(playerScope);

  return {
    playerScope,
    legacy,
    bgVideoA: document.getElementById("bg-video-a") as HTMLVideoElement | null,
    bgVideoB: document.getElementById("bg-video-b") as HTMLVideoElement | null,
    bgImageA: document.getElementById("bg-image-a"),
    bgImageB: document.getElementById("bg-image-b"),
    cutsceneVideo: document.getElementById("cutscene-video") as HTMLVideoElement | null,
    cutsceneText: document.getElementById("cutscene-text"),
    bookContainer,
    leftNotes,
    contentContainer,
    rightNotes,
    rightNotesScrollable: document.getElementById("right-notes-scrollable-container"),
    rootPlayer: actualRootPlayer,
  };
}

function createRootPlayer(parent: HTMLElement): HTMLElement {
  const rootPlayer = document.createElement("div");
  rootPlayer.id = "root-player";
  parent.appendChild(rootPlayer);
  return rootPlayer;
}

/**
 * Create all player DOM elements dynamically
 */
function createPlayerDOM(isNativeShell: boolean): { dom: PlayerDOM; createdPlayerScope: boolean } {
  let playerScope = document.getElementById("player-scope");
  let createdPlayerScope = false;

  // Create #player-scope if it doesn't exist
  if (!playerScope) {
    playerScope = document.createElement("div");
    playerScope.id = "player-scope";
    // Start hidden - will be made visible when player is ready
    playerScope.setAttribute("inert", "");
    playerScope.setAttribute("aria-hidden", "true");
    document.body.appendChild(playerScope);
    createdPlayerScope = true;
  }

  // Create cutscene video
  const cutsceneVideo = document.createElement("video");
  cutsceneVideo.id = "cutscene-video";
  cutsceneVideo.className = "cutscene-video";
  cutsceneVideo.playsInline = true;
  playerScope.appendChild(cutsceneVideo);

  // Create legacy container
  const legacy = document.createElement("div");
  legacy.id = "legacy";
  if (isNativeShell) {
    legacy.classList.add("native-shell");
  }
  playerScope.appendChild(legacy);

  // Background videos/images (only if not native shell)
  let bgVideoA: HTMLVideoElement | null = null;
  let bgVideoB: HTMLVideoElement | null = null;
  let bgImageA: HTMLElement | null = null;
  let bgImageB: HTMLElement | null = null;

  if (!isNativeShell) {
    bgVideoA = document.createElement("video");
    bgVideoA.id = "bg-video-a";
    bgVideoA.className = "bg-element";
    bgVideoA.autoplay = true;
    bgVideoA.muted = true;
    bgVideoA.loop = true;
    bgVideoA.playsInline = true;
    legacy.appendChild(bgVideoA);

    bgVideoB = document.createElement("video");
    bgVideoB.id = "bg-video-b";
    bgVideoB.className = "bg-element faded";
    bgVideoB.autoplay = true;
    bgVideoB.muted = true;
    bgVideoB.loop = true;
    bgVideoB.playsInline = true;
    legacy.appendChild(bgVideoB);

    bgImageA = document.createElement("div");
    bgImageA.id = "bg-image-a";
    bgImageA.className = "bg-element faded";
    legacy.appendChild(bgImageA);

    bgImageB = document.createElement("div");
    bgImageB.id = "bg-image-b";
    bgImageB.className = "bg-element faded";
    legacy.appendChild(bgImageB);
  }

  // Cutscene text
  const cutsceneText = document.createElement("p");
  cutsceneText.id = "cutscene-text";
  legacy.appendChild(cutsceneText);

  // Book container
  const bookContainer = document.createElement("div");
  bookContainer.id = "book-container";
  bookContainer.className = "flex flex-row justify-center mx-auto max-w-[120rem] w-full xl:px-2";
  legacy.appendChild(bookContainer);

  // Left notes
  const leftNotes = document.createElement("div");
  leftNotes.id = "left-notes";
  leftNotes.className =
    "hidden sm:block sm:flex-1 sm:w-auto max-w-[700px] content-center overflow-y-auto mr-2";
  bookContainer.appendChild(leftNotes);

  // Content container
  const contentContainer = document.createElement("div");
  contentContainer.id = "content-container";
  contentContainer.className =
    "max-w-[800px] sm:flex-3 xl:flex-none xl:w-[850px] xl:max-w-[850px] xxl:w-[900px] xxl:max-w-[900px]";
  bookContainer.appendChild(contentContainer);

  // Right notes
  const rightNotes = document.createElement("div");
  rightNotes.id = "right-notes";
  rightNotes.className = "hidden xl:block xl:flex-1 max-w-[700px] pointer-events-none ml-2";
  bookContainer.appendChild(rightNotes);

  const rightNotesScrollable = document.createElement("div");
  rightNotesScrollable.id = "right-notes-scrollable-container";
  rightNotes.appendChild(rightNotesScrollable);

  // Root player (React mount point)
  const rootPlayer = document.createElement("div");
  rootPlayer.id = "root-player";
  playerScope.appendChild(rootPlayer);

  return {
    dom: {
      playerScope,
      legacy,
      bgVideoA,
      bgVideoB,
      bgImageA,
      bgImageB,
      cutsceneVideo,
      cutsceneText,
      bookContainer,
      leftNotes,
      contentContainer,
      rightNotes,
      rightNotesScrollable,
      rootPlayer,
    },
    createdPlayerScope,
  };
}

/**
 * Cleanup dynamically created DOM elements
 */
function cleanupCreatedDOM(dom: PlayerDOM, createdPlayerScope: boolean) {
  dom.cutsceneVideo?.remove();
  dom.legacy.remove();
  dom.rootPlayer.remove();

  // Remove #player-scope if we created it
  if (createdPlayerScope) {
    dom.playerScope.remove();
  }
}

/**
 * Initialize player DOM - call this before rendering PlayerDOMProvider.
 * Returns the DOM object that should be passed to PlayerDOMProvider.
 */
export function initializePlayerDOM(
  isNativeShell: boolean,
  forceCreate: boolean = false,
): { dom: PlayerDOM; wasCreated: boolean; createdPlayerScope: boolean } {
  if (!forceCreate) {
    const existing = findExistingDOM();
    if (existing) {
      return { dom: existing, wasCreated: false, createdPlayerScope: false };
    }
  }

  const { dom, createdPlayerScope } = createPlayerDOM(isNativeShell);
  return { dom, wasCreated: true, createdPlayerScope };
}

interface PlayerDOMProviderWithDOMProps {
  children: React.ReactNode;
  dom: PlayerDOM;
  wasCreated: boolean;
  createdPlayerScope: boolean;
}

/**
 * Provider that receives pre-initialized DOM.
 * Use initializePlayerDOM() to get the dom and wasCreated values.
 */
export function PlayerDOMProviderWithDOM({
  children,
  dom,
  wasCreated,
  createdPlayerScope,
}: PlayerDOMProviderWithDOMProps) {
  // Cleanup on unmount if we created the DOM
  useLayoutEffect(() => {
    return () => {
      if (wasCreated) {
        cleanupCreatedDOM(dom, createdPlayerScope);
      }
    };
  }, [dom, wasCreated, createdPlayerScope]);

  return <PlayerDOMContext.Provider value={dom}>{children}</PlayerDOMContext.Provider>;
}

/**
 * Convenience wrapper that handles initialization internally.
 * Note: This uses useState with initializer, which runs once on mount.
 */
export function PlayerDOMProvider({ children, forceCreate = false }: PlayerDOMProviderProps) {
  const isNativeShell = useNativeShell();

  // useState with initializer function runs once synchronously on first render
  const [{ dom, wasCreated, createdPlayerScope }] = useState(() =>
    initializePlayerDOM(isNativeShell, forceCreate),
  );

  // Cleanup on unmount if we created the DOM
  useLayoutEffect(() => {
    return () => {
      if (wasCreated) {
        cleanupCreatedDOM(dom, createdPlayerScope);
      }
    };
  }, [dom, wasCreated, createdPlayerScope]);

  return <PlayerDOMContext.Provider value={dom}>{children}</PlayerDOMContext.Provider>;
}

/**
 * Hook to access player DOM elements.
 * Must be used within a PlayerDOMProvider.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function usePlayerDOM(): PlayerDOM {
  const dom = useContext(PlayerDOMContext);
  if (!dom) {
    throw new Error("usePlayerDOM must be used within a PlayerDOMProvider");
  }
  return dom;
}

/**
 * Hook to safely access player DOM elements.
 * Returns null if not within a PlayerDOMProvider.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function usePlayerDOMSafe(): PlayerDOM | null {
  return useContext(PlayerDOMContext);
}
