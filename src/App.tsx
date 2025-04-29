import React, { useEffect, useState } from "react";

import { LocationProvider } from "./state/LocationContext";
import { usePageObserver } from "./hooks/usePageObserver";
import { useCutScene } from "./hooks/useCutScene";
import { useBackgroundVideo } from "./hooks/useBackgroundVideo";
import { useBookContent } from "./hooks/useBookContent";
import { faraonBookXml } from "./data/faraon-book-xml";

import BookChaptersModal from "./menu-modal";
import NoteLinkBlinker from "./react-bridge/NoteLinkBlinker";
import { runLegacyInit } from "./main";
import { CharacterNotesPanel } from "./components/CharacterNotesPanel";
import { RightNotesPanel } from "./components/RightNotesPanel";
import { useWebSocket, WebSocketProvider } from "./context/WebSocketContext";
import { BottomInput } from "./components/BottomInput";
import { RealtimeProvider } from "./context/RealtimeContext";
import { DeepResearchModal } from "./ui/DeepResearchModal";

function Shell({ setShowDeepResearch, showDeepResearch, passedText }: { setShowDeepResearch: (show: boolean) => void; showDeepResearch: boolean; passedText?: string }) {
  /* Inject book content first */
  useBookContent(faraonBookXml, "content-container");

  /* scroll‑related hooks */
  usePageObserver(faraonBookXml);

  /* dynamic visual hooks */
  useCutScene();
  useBackgroundVideo();

  return (
    <>
      <BookChaptersModal onShowDeepResearch={() => setShowDeepResearch(true)} />
      <NoteLinkBlinker />
      <CharacterNotesPanel />
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
  /* State for Deep Research Modal */
  const [showDeepResearch, setShowDeepResearch] = useState(false);
  const [deepResearchResult, setDeepResearchResult] = useState<string | null>(null);
  /* kick the imperative bootstrap once */
  useEffect(() => {
    runLegacyInit();
  }, []);

  return (
    <LocationProvider>
      <RealtimeProvider>
        <WebSocketProvider>
          <Shell setShowDeepResearch={setShowDeepResearch} showDeepResearch={showDeepResearch} passedText={deepResearchResult} />
          <ChatContainer
            onShowDeepResearch={(result) => {
              setDeepResearchResult(result);
              setShowDeepResearch(true);
            }}
            onCloseDeepResearch={() => setShowDeepResearch(false)}
          />
        </WebSocketProvider>
      </RealtimeProvider>
    </LocationProvider>
  );
}
