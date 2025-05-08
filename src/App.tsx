import React, { useEffect, useState } from "react";

import { LocationProvider } from "./state/LocationContext";
import { usePageObserver } from "./hooks/usePageObserver";
import { useCutScene } from "./hooks/useCutScene";
import { useBackgroundVideo } from "./hooks/useBackgroundVideo";
import { useBookContent } from "./hooks/useBookContent";

import BookChaptersModal from "./menu-modal";
import NoteLinkBlinker from "./react-bridge/NoteLinkBlinker";
import { runLegacyInit } from "./main";
import { CharacterNotesPanel } from "./components/CharacterNotesPanel";
import { RightNotesPanel } from "./components/RightNotesPanel";
import { useWebSocket, WebSocketProvider } from "./context/WebSocketContext";
import { BottomInput } from "./components/BottomInput";
import { RealtimeProvider } from "./context/RealtimeContext";
import { DeepResearchModal } from "./ui/DeepResearchModal";
import { getBookData } from "./booksData/getBookData";
import { useBackgroundSongs } from "./hooks/useBackgroundSongs";
import { BookData } from "./booksData/types";
import { ModalProvider } from "./context/ModalContext";

function Shell({
  bookData,
  setShowDeepResearch,
  showDeepResearch,
  passedText,
}: {
  bookData: BookData;
  setShowDeepResearch: (show: boolean) => void;
  showDeepResearch: boolean;
  passedText?: string;
}) {
  /* Inject book content first */
  useBookContent(bookData.bookXml, "content-container");

  /* scroll‑related hooks */
  usePageObserver(bookData.bookXml);

  /* dynamic visual hooks */
  useCutScene();
  useBackgroundVideo();
  useBackgroundSongs();

  return (
    <>
      <BookChaptersModal bookData={bookData} onShowDeepResearch={() => setShowDeepResearch(true)} />
      <NoteLinkBlinker />
      <CharacterNotesPanel bookData={bookData} />
      <RightNotesPanel />
      <DeepResearchModal isOpen={showDeepResearch} onClose={() => setShowDeepResearch(false)} passedText={passedText} />
    </>
  );
}

const ChatContainer = ({ onShowDeepResearch, onCloseDeepResearch }: { onShowDeepResearch: (result: string) => void; onCloseDeepResearch: () => void }) => {
  const { sendMessage } = useWebSocket();

  return <BottomInput placeholder="Poszukaj albo zapytaj" onSubmit={sendMessage} onShowDeepResearch={onShowDeepResearch} onCloseDeepResearch={onCloseDeepResearch} />;
};

export default function App() {
  const [currentBookData, setCurrentBookData] = useState<BookData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showDeepResearch, setShowDeepResearch] = useState(false);
  const [deepResearchResult, setDeepResearchResult] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
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
    };

    loadData();
    runLegacyInit();
  }, []);

  if (isLoading) {
    return <div>Loading book content...</div>;
  }

  if (error) {
    return <div>Error loading book: {error}</div>;
  }

  return (
    <LocationProvider>
      <RealtimeProvider>
        <WebSocketProvider>
          <ModalProvider>
            <Shell bookData={currentBookData} setShowDeepResearch={setShowDeepResearch} showDeepResearch={showDeepResearch} passedText={deepResearchResult} />
            <ChatContainer
              onShowDeepResearch={(result) => {
                setDeepResearchResult(result);
                setShowDeepResearch(true);
              }}
              onCloseDeepResearch={() => setShowDeepResearch(false)}
            />
          </ModalProvider>
        </WebSocketProvider>
      </RealtimeProvider>
    </LocationProvider>
  );
}
