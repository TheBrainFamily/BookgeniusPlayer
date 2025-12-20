/**
 * LiveModeApp - Player entry point for live CMS preview mode.
 *
 * This component wraps the player with Convex context and loads book data
 * reactively from the CMS. When content changes in the CMS, the player
 * updates automatically.
 *
 * Usage: Navigate to player with ?live=true&book=1984-English
 */

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { LiveBookDataProvider, useLiveBookData } from "@player/context/LiveBookDataContext";
import { injectLiveData, clearLiveData } from "@player/services/live/liveDataInjector";
import React, { useEffect, useState, useMemo } from "react";
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
import { useBookContent } from "@player/hooks/useBookContent";
import { useElementVisibility } from "./hooks/useElementVisibility";
import { useTextCacheManager } from "./hooks/useTextCacheManager";
import ProgressBars from "@player/components/ProgressBars";
import { BookDataProvider } from "./context/BookDataContext";
import { languageNameToCode } from "@player/helpers/languageNameToCode";
import { setupUnloadHandlers } from "./services/setupUnloadHandlers";
import { ScrollIndicator } from "@player/components/ScrollIndicator";
import { RightNotesPanel } from "./components/RightNotesPanel";
import { DebugLocationOverlay } from "./components/DebugLocationOverlay";
import { bookIndex } from "@player/logic/BookIndex";
import { textCacheManager } from "@player/logic/TextCacheManager";

// =============================================================================
// Convex Client
// =============================================================================

const convexUrl = import.meta.env.VITE_CONVEX_URL;

if (!convexUrl) {
  console.error("[LiveMode] VITE_CONVEX_URL is not set");
}

const convex = new ConvexReactClient(convexUrl || "");

// =============================================================================
// Shell Component (same as App.tsx but for live mode)
// =============================================================================

function LiveShell({ onShellMounted }: { onShellMounted: () => void }) {
  useBookContent();
  useElementVisibility();
  useTextCacheManager();
  useCutScene();
  useBackgroundVideo();
  useAppReady();
  useBackgroundSongs();

  const { i18n: i18nInstance } = useTranslation();
  const { bookData } = useLiveBookData();

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
      <EditorMode />
    </>
  );
}

// =============================================================================
// Live App Initializer
// =============================================================================

interface LiveAppInitializerProps {
  children: React.ReactNode;
}

function LiveAppInitializer({ children }: LiveAppInitializerProps) {
  const liveData = useLiveBookData();
  const [isReady, setIsReady] = useState(false);

  // Inject live data into global caches when available
  useEffect(() => {
    if (liveData.isLoading) {
      return;
    }

    if (liveData.error) {
      console.error("[LiveMode] Error loading data:", liveData.error);
      return;
    }

    if (!liveData.bookStringified || !liveData.bookData) {
      return;
    }

    console.log("[LiveMode] Injecting live data:", liveData);
    // Inject data into caches
    injectLiveData({
      bookStringified: liveData.bookStringified,
      backgroundsForBook: liveData.backgroundsForBook,
      backgroundSongsForBook: liveData.backgroundSongsForBook,
      charactersData: liveData.charactersData,
      bookData: liveData.bookData,
      chapters: liveData.chapters,
      characterBundles: liveData.characterBundles,
    });

    // Reinitialize book index and text cache
    bookIndex.invalidate();
    textCacheManager.reset();
    textCacheManager.initialize();

    // Setup background styling
    const backgroundsEmpty = liveData.backgroundsForBook.length === 0;
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

    setIsReady(true);
  }, [liveData]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearLiveData();
    };
  }, []);

  if (liveData.isLoading) {
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

  if (liveData.error) {
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
          <div style={{ fontSize: "14px", color: "#888" }}>{liveData.error}</div>
        </div>
      </div>
    );
  }

  if (!isReady) {
    return null;
  }

  // Key children on textVersion to force remount when data changes
  // This ensures BookDataProvider and useBookContent reinitialize with fresh data
  return <React.Fragment key={liveData.textVersion}>{children}</React.Fragment>;
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
          <div style={{ fontSize: "24px", marginBottom: "16px" }}>Live Mode Configuration Error</div>
          <div style={{ fontSize: "14px", color: "#888" }}>VITE_CONVEX_URL environment variable is not set</div>
        </div>
      </div>
    );
  }

  return (
    <ConvexProvider client={convex}>
      <LiveBookDataProvider bookPath={bookPath}>
        <I18nextProvider i18n={i18n}>
          <LiveAppInitializer>
            <BookDataProvider>
              <LocationProvider>
                <RealtimeProvider>
                  <BookContentWrapper>
                    <LiveShell onShellMounted={() => setReactDomReady(true)} />
                    <ModalRenderers />
                    <ContentShiftWrapper />
                  </BookContentWrapper>
                  <DebugLocationOverlay />
                </RealtimeProvider>
              </LocationProvider>
            </BookDataProvider>
          </LiveAppInitializer>
        </I18nextProvider>
      </LiveBookDataProvider>
    </ConvexProvider>
  );
}
