import { useEffect, useState } from "react";
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
import { useAudiobookTracks } from "@/hooks/useAudiobookTracks";

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
import { useQuiz } from "./hooks/useQuiz";
import { useTextCacheManager } from "./hooks/useTextCacheManager";
import ProgressBars from "@/components/ProgressBars";
import { usePlayCharacterSelect } from "./hooks/usePlayCharacterSelect";

function Shell({ onShellMounted }: { onShellMounted: () => void }) {
  setKnownVideos(getKnownVideoFiles());
  useBookContent("content-container");
  useElementVisibility();

  /* text cache manager */
  useTextCacheManager();

  /* dynamic visual hooks */
  useCutScene();
  useBackgroundVideo();
  useQuiz();

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
      console.warn("AudioContext could not be started automatically.");
    }
  }, [splashHidden]);

  useEffect(() => {
    if (!fontSize) return;

    document.documentElement.style.setProperty("--font-size-multiplier", String(fontSize));
  }, [fontSize]);

  return (
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
  );
}
