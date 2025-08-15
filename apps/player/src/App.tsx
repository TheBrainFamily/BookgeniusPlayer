import React, { useEffect, useState } from "react";
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
import { useAudiobookTracks } from "@player/hooks/useAudiobookTracks";

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
import { setKnownVideos } from "@player/utils/getFilePathsForName";
import { getKnownVideoFiles } from "@player/genericBookDataGetters/getKnownVideoFiles";
import { useTextCacheManager } from "./hooks/useTextCacheManager";
import ProgressBars from "@player/components/ProgressBars";
import { usePlayCharacterSelect } from "./hooks/usePlayCharacterSelect";
import { AppInitializer } from "./components/AppInitializer";
import { BookDataProvider } from "./context/BookDataContext";

function Shell({ onShellMounted }: { onShellMounted: () => void }) {
  setKnownVideos(getKnownVideoFiles());
  useBookContent("content-container");
  useElementVisibility();

  /* text cache manager */
  useTextCacheManager();

  /* dynamic visual hooks */
  useCutScene();
  useBackgroundVideo();

  /* app ready hook */
  useAppReady();

  /* dynamic audio hooks */
  useBackgroundSongs();
  useAudiobookTracks();
  usePlayCharacterSelect();

  useEffect(() => {
    onShellMounted();
  }, []);

  return (
    <>
      <ProgressBars />
      <Header />
      <NoteLinkBlinker />
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
      console.warn("AudioContext could not be started automatically. User interaction (e.g., clicking 'Enable Audio') might be required.");
    }
  }, [splashHidden]);

  useEffect(() => {
    if (!fontSize) return;

    document.documentElement.style.setProperty("--font-size-multiplier", String(fontSize));
  }, [fontSize]);

  return (
    <AppInitializer>
      <BookDataProvider>
        <LocationProvider>
          <RealtimeProvider>
            <WebSocketProvider>
              <BookContentWrapper>
                <Shell onShellMounted={() => setReactDomReady(true)} />
                <ModalRenderers />
              </BookContentWrapper>
            </WebSocketProvider>
          </RealtimeProvider>
        </LocationProvider>
      </BookDataProvider>
    </AppInitializer>
  );
}
