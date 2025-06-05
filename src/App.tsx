import React, { useEffect } from "react";
import useLocalStorageState from "use-local-storage-state";

import { LocationProvider } from "./state/LocationContext";
import { useCutScene } from "./hooks/useCutScene";
import { useBackgroundVideo } from "./hooks/useBackgroundVideo";

import NoteLinkBlinker from "./react-bridge/NoteLinkBlinker";
import { runLegacyInit } from "./main";
import { WebSocketProvider } from "./context/WebSocketContext";
import { RealtimeProvider } from "./context/RealtimeContext";
import { useBackgroundSongs } from "./hooks/useBackgroundSongs";
import { BookContentWrapper } from "./components/BookContentWrapper";
import { BookThemeProvider } from "./context/BookThemeContext";
import { useAudiobookTracks } from "@/hooks/useAudiobookTracks";

import ContentContainerWrapper from "./components/ContentContainerWrapper";
import Header from "./components/Header";
import Footer from "./components/Footer";
import { EditorMode } from "@/components/EditorMode";
import { useAppReady } from "./hooks/useAppReady";
import useSplashHidden from "./hooks/useSplashHidden";
import { initAudioContext } from "./audio-crossfader";
import CharacterNotesPanel from "./components/CharacterNotesPanel";
import { ModalRenderers } from "./features/ModalRenderers";
import { useBookContent } from "@/hooks/useBookContent";
import { useElementVisibility } from "./hooks/useElementVisibility";
import { setKnownVideos } from "@/utils/getFilePathsForName";
import { getKnownVideoFiles } from "@/genericBookDataGetters/getKnownVideoFiles";

function Shell() {
  setKnownVideos(getKnownVideoFiles());
  useBookContent("content-container");
  useElementVisibility();

  /* dynamic visual hooks */
  useCutScene();
  useBackgroundVideo();

  /* app ready hook */
  useAppReady();

  /* dynamic audio hooks */
  useBackgroundSongs();
  useAudiobookTracks();

  return (
    <>
      <Header />
      <NoteLinkBlinker />
      <ContentContainerWrapper /> {/* Keep for animations */}
      <CharacterNotesPanel />
      {/* Not used for now, but can be re-enabled if needed later */}
      {/* <RightNotesPanel /> */}
      <Footer />
      {import.meta.env.VITE_EDITOR === "true" && <EditorMode />}
    </>
  );
}

export default function App() {
  const splashHidden = useSplashHidden();

  const [fontSize] = useLocalStorageState("fontSize", { defaultValue: 1 });

  useEffect(() => {
    runLegacyInit();
  }, []);

  useEffect(() => {
    if (!splashHidden) return;

    const audioReady = initAudioContext();
    if (!audioReady) {
      console.warn("AudioContext could not be started automatically. User interaction (e.g., clicking 'Enable Audio') might be required.");
    }
  }, [splashHidden]);

  useEffect(() => {
    const newFontSize = 16 * fontSize;
    const contentContainer = document.getElementById("content-container");
    if (contentContainer) {
      contentContainer.style.fontSize = `${newFontSize}px`;
    }
  }, [fontSize]);

  return (
    <LocationProvider>
      <RealtimeProvider>
        <WebSocketProvider>
          <BookThemeProvider>
            <BookContentWrapper>
              <Shell />
              <ModalRenderers />
            </BookContentWrapper>
          </BookThemeProvider>
        </WebSocketProvider>
      </RealtimeProvider>
    </LocationProvider>
  );
}
