/**
 * LiveModeApp - Unified Convex-based Player Entry Point
 *
 * All player modes now use Convex for data loading.
 * Draft mode is controlled by ?draft=true or ?editor=true URL params.
 *
 * Features:
 * - Reactive updates from CMS
 * - Draft-aware queries for editors
 * - Scroll position preservation on content changes
 */

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { BookConvexProvider, useBookConvex } from "@player/context/BookConvexContext";
import { DraftModeProvider } from "@player/context/DraftModeContext";
import { EditModeProvider } from "@player/context/EditModeContext";
import React, { useEffect, useState } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import i18n from "./i18n";
import useLocalStorageState from "use-local-storage-state";

import { LocationProvider } from "./state/LocationContext";
import { useCutScene } from "./hooks/useCutScene";
import { useBackgroundVideo } from "./hooks/useBackgroundVideo";
import NoteLinkBlinker from "./react-bridge/NoteLinkBlinker";
import { runLegacyInit } from "./main";
import { RealtimeProvider } from "./context/RealtimeContext";
import { useBackgroundSongs } from "./hooks/useBackgroundSongs";
import { BookContentWrapper } from "./components/BookContentWrapper";
import { ContentShiftWrapper } from "./components/ContentShiftWrapper";
import Header from "./components/Header";
import Footer from "./components/Footer";
import { EditorMode } from "@player/components/EditorMode";
import { useAppReady } from "./hooks/useAppReady";
import useSplashHidden from "./hooks/useSplashHidden";
import { initAudioContext } from "./audio-crossfader";
import CharacterNotesPanel from "./components/CharacterNotesPanel";
import { ModalRenderers } from "./features/ModalRenderers";
import { ParagraphEditConnector } from "./features/ParagraphEditConnector";
import { useBookContent } from "@player/hooks/useBookContent";
import { useElementVisibility } from "./hooks/useElementVisibility";
import { useTextCacheManager } from "./hooks/useTextCacheManager";
import { useCriticalAssetPreloader } from "./hooks/useCriticalAssetPreloader";
import { usePostReadyPrefetch } from "./hooks/usePostReadyPrefetch";
import ProgressBars from "@player/components/ProgressBars";
import { languageNameToCode } from "@player/helpers/languageNameToCode";
import { setupUnloadHandlers } from "./services/setupUnloadHandlers";
import { ScrollIndicator } from "@player/components/ScrollIndicator";
import { RightNotesPanel } from "./components/RightNotesPanel";
import { DebugLocationOverlay } from "./components/DebugLocationOverlay";
import { AvatarGenerationBadge } from "./components/AvatarGenerationBadge";
import { useDraftMode } from "@player/context/DraftModeContext";

// =============================================================================
// Convex Client
// =============================================================================

const convexUrl = import.meta.env.VITE_CONVEX_URL;

if (!convexUrl) {
  console.error("[LiveMode] VITE_CONVEX_URL is not set");
}

const convex = new ConvexReactClient(convexUrl || "");

// =============================================================================
// Shell Component
// =============================================================================

function LiveShell({ onShellMounted }: { onShellMounted: () => void }) {
  useBookContent();
  useElementVisibility();
  useTextCacheManager();
  useCutScene();
  useBackgroundVideo();
  useAppReady();
  usePostReadyPrefetch();
  useBackgroundSongs();

  const { i18n: i18nInstance } = useTranslation();
  const { bookData } = useBookConvex();
  const draftMode = useDraftMode();

  useEffect(() => {
    onShellMounted();
    if (bookData?.metadata?.language) {
      void i18nInstance.changeLanguage(languageNameToCode(bookData.metadata.language));
    }
  }, [onShellMounted, i18nInstance, bookData]);

  return (
    <>
      <ProgressBars />
      <Header />
      <NoteLinkBlinker />
      <CharacterNotesPanel />
      <RightNotesPanel />
      <ScrollIndicator />
      <Footer />
      {/* Show editor controls in draft mode */}
      {draftMode && <EditorMode />}
    </>
  );
}

// =============================================================================
// Critical Asset Preloader (runs before ConvexAppInitializer gate)
// =============================================================================

/**
 * Runs useCriticalAssetPreloader to start loading background videos and music
 * as soon as Convex queries return, BEFORE waiting for chapter processing.
 * This allows heavy assets to download in parallel with XML processing.
 */
function CriticalAssetPreloader() {
  useCriticalAssetPreloader();
  return null; // Renders nothing, just runs the hook
}

// =============================================================================
// Convex App Initializer
// =============================================================================

interface ConvexAppInitializerProps {
  children: React.ReactNode;
}

function ConvexAppInitializer({ children }: ConvexAppInitializerProps) {
  const { isLoading, isReady, error, backgroundsForBook } = useBookConvex();

  // Setup background styling when ready
  useEffect(() => {
    if (!isReady) return;

    const backgroundsEmpty = backgroundsForBook.length === 0;
    const legacyEl = document.getElementById("legacy") as HTMLElement;
    const contentContainerEl = document.querySelector("#legacy #content-container") as HTMLElement;

    if (legacyEl && contentContainerEl) {
      if (backgroundsEmpty) {
        legacyEl.style.backgroundColor = "lightgray";
        contentContainerEl.style.setProperty("mask-image", "none");
        contentContainerEl.style.setProperty("-webkit-mask-image", "none");
      } else {
        legacyEl.style.backgroundColor = "black";
        contentContainerEl.style.removeProperty("mask-image");
        contentContainerEl.style.removeProperty("-webkit-mask-image");
      }
    }
  }, [isReady, backgroundsForBook]);

  if (isLoading) {
    return (
      <div
        style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", backgroundColor: "#1a1a1a", color: "#fff", fontFamily: "system-ui, sans-serif" }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "24px", marginBottom: "16px" }}>Loading from CMS...</div>
          <div style={{ fontSize: "14px", color: "#888" }}>Connecting to Convex</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          backgroundColor: "#1a1a1a",
          color: "#ff6b6b",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "24px", marginBottom: "16px" }}>Failed to load book</div>
          <div style={{ fontSize: "14px", color: "#888" }}>{error}</div>
        </div>
      </div>
    );
  }

  if (!isReady) {
    return (
      <div
        style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", backgroundColor: "#1a1a1a", color: "#fff", fontFamily: "system-ui, sans-serif" }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "24px", marginBottom: "16px" }}>Processing book...</div>
          <div style={{ fontSize: "14px", color: "#888" }}>Converting chapters</div>
        </div>
      </div>
    );
  }

  // NO key prop here - we keep the tree mounted for scroll preservation
  // BookConvexContext handles all data updates reactively
  return <>{children}</>;
}

// =============================================================================
// Main LiveModeApp Component
// =============================================================================

interface LiveModeAppProps {
  bookPath: string;
}

export function LiveModeApp({ bookPath }: LiveModeAppProps) {
  const splashHidden = useSplashHidden();
  const [fontSize] = useLocalStorageState("fontSize", { defaultValue: 1 });
  const [reactDomReady, setReactDomReady] = useState(false);

  useEffect(() => {
    if (!reactDomReady) return;
    runLegacyInit();
  }, [reactDomReady]);

  useEffect(() => {
    if (!splashHidden) return;

    const bookContainer = document.getElementById("book-container");
    if (bookContainer) {
      bookContainer.classList.add("visible");
    }

    const audioReady = initAudioContext();
    if (!audioReady) {
      console.warn("AudioContext could not be started automatically.");
    }
  }, [splashHidden]);

  useEffect(() => {
    if (!fontSize) return;
    document.documentElement.style.setProperty("--font-size-multiplier", String(fontSize));
  }, [fontSize]);

  useEffect(() => {
    const cleanup = setupUnloadHandlers();
    return cleanup;
  }, []);

  if (!convexUrl) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", backgroundColor: "#1a1a1a", color: "#ff6b6b" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "24px", marginBottom: "16px" }}>Configuration Error</div>
          <div style={{ fontSize: "14px", color: "#888" }}>VITE_CONVEX_URL environment variable is not set</div>
        </div>
      </div>
    );
  }

  return (
    <ConvexProvider client={convex}>
      <DraftModeProvider>
        <EditModeProvider>
          <BookConvexProvider bookPath={bookPath}>
            <CriticalAssetPreloader />
            <ParagraphEditConnector />
            <I18nextProvider i18n={i18n}>
              <ConvexAppInitializer>
                <LocationProvider>
                  <RealtimeProvider>
                    <BookContentWrapper>
                      <LiveShell onShellMounted={() => setReactDomReady(true)} />
                      <ModalRenderers />
                      <AvatarGenerationBadge />
                      <ContentShiftWrapper />
                    </BookContentWrapper>
                    <DebugLocationOverlay />
                  </RealtimeProvider>
                </LocationProvider>
              </ConvexAppInitializer>
            </I18nextProvider>
          </BookConvexProvider>
        </EditModeProvider>
      </DraftModeProvider>
    </ConvexProvider>
  );
}
