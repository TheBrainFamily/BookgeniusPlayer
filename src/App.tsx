import React, { useEffect, useState, useCallback } from "react";

import { LocationProvider } from "./state/LocationContext";
import { usePageObserver } from "./hooks/usePageObserver";
import { useCutScene } from "./hooks/useCutScene";
import { useBackgroundVideo } from "./hooks/useBackgroundVideo";
import { useBookContent } from "./hooks/useBookContent";

import NoteLinkBlinker from "./react-bridge/NoteLinkBlinker";
import { runLegacyInit } from "./main";
import { RightNotesPanel } from "./components/RightNotesPanel";
import { WebSocketProvider } from "./context/WebSocketContext";
import { RealtimeProvider } from "./context/RealtimeContext";
import { getBookData } from "./booksData/getBookData";
import { useBackgroundSongs } from "./hooks/useBackgroundSongs";
import { BookData } from "./booksData/types";
import { ModalProvider, useModal } from "./context/ModalContext";
import { BookContentWrapper } from "./components/BookContentWrapper";
import { BookThemeProvider } from "./context/BookThemeContext";
import { useAudiobookTracks } from "@/hooks/useAudiobookTracks";

import SplashScreen from "./components/SplashScreen";
import CharacterNotesPanel from "./components/CharacterNotesPanel";
import ContentContainerWrapper from "./components/ContentContainerWrapper";
import Header from "./components/Header";
import Footer from "./components/Footer";
import { EditorMode } from "@/components/EditorMode";

function Shell({ bookData }: { bookData: BookData; passedText?: string }) {
  /* Inject book content first */
  useBookContent(bookData.bookXml, "content-container");

  /* scroll‑related hooks */
  usePageObserver(bookData.bookXml, useModal());

  /* dynamic visual hooks */
  useCutScene();
  useBackgroundVideo();

  /* dynamic audio hooks */
  useBackgroundSongs();
  useAudiobookTracks();

  return (
    <>
      <Header />
      <NoteLinkBlinker />
      <CharacterNotesPanel bookData={bookData} />
      <ContentContainerWrapper />
      <RightNotesPanel />
      <Footer />
      {import.meta.env.VITE_EDITOR === "true" && <EditorMode />}
    </>
  );
}

export default function App() {
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
                <SplashScreen />
              </ModalProvider>
            </BookContentWrapper>
          </BookThemeProvider>
        </WebSocketProvider>
      </RealtimeProvider>
    </LocationProvider>
  );
}
