import React, { useEffect, useState, useCallback } from "react";

import { LocationProvider } from "./state/LocationContext";
import { useCutScene } from "./hooks/useCutScene";
import { useBackgroundVideo } from "./hooks/useBackgroundVideo";

import NoteLinkBlinker from "./react-bridge/NoteLinkBlinker";
import { runLegacyInit } from "./main";
import { WebSocketProvider } from "./context/WebSocketContext";
import { RealtimeProvider } from "./context/RealtimeContext";
import { getBookData } from "./booksData/getBookData";
import { useBackgroundSongs } from "./hooks/useBackgroundSongs";
import { BookData } from "./booksData/types";
import { ModalProvider } from "./context/ModalContext";
import { BookContentWrapper } from "./components/BookContentWrapper";
import { BookThemeProvider } from "./context/BookThemeContext";
import { useAudiobookTracks } from "@/hooks/useAudiobookTracks";

import CharacterNotesPanel from "./components/CharacterNotesPanel";
import ContentContainerWrapper from "./components/ContentContainerWrapper";
import Header from "./components/Header";
import Footer from "./components/Footer";
import { EditorMode } from "@/components/EditorMode";
import useLocalStorageState from "use-local-storage-state";
import { BookChapterRenderer } from "./BookChapterRenderer";
import { useAppReady } from "./hooks/useAppReady";
import useSplashHidden from "./hooks/useSplashHidden";
import { initAudioContext } from "./audio-crossfader";

function Shell({ bookData }: { bookData: BookData }) {
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
      <BookChapterRenderer bookData={bookData} /> {/* New component for content */}
      <NoteLinkBlinker />
      <CharacterNotesPanel bookData={bookData} />
      <ContentContainerWrapper /> {/* Keep for animations */}
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

  const [currentBookData, setCurrentBookData] = useState<BookData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await getBookData();
      setCurrentBookData(data);
      setError(null);
    } catch (err) {
      console.error("Failed to load book data:", err);
      setError(err instanceof Error ? err.message : "An unknown error occurred");
      setCurrentBookData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  if (isLoading) return null;

  if (error) {
    return <div>Error loading book: {error}</div>;
  }

  return (
    <LocationProvider>
      <RealtimeProvider>
        <WebSocketProvider>
          <BookThemeProvider>
            <BookContentWrapper>
              <ModalProvider bookData={currentBookData}>
                <Shell bookData={currentBookData} />
              </ModalProvider>
            </BookContentWrapper>
          </BookThemeProvider>
        </WebSocketProvider>
      </RealtimeProvider>
    </LocationProvider>
  );
}
