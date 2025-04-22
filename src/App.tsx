import React, { useEffect } from "react";

import { LocationProvider } from "./state/LocationContext";
import { usePageObserver } from "./hooks/usePageObserver";
import { useCutScene } from "./hooks/useCutScene";
import { useBackgroundVideo } from "./hooks/useBackgroundVideo";

import BookChaptersModal from "./menu-modal";
import NoteLinkBlinker from "./react-bridge/NoteLinkBlinker";
import { runLegacyInit } from "./main";
import { CharacterNotesPanel } from "./components/CharacterNotesPanel";

function Shell() {
  /* scroll‑related hooks */
  usePageObserver();

  /* dynamic visual hooks */
  useCutScene();
  useBackgroundVideo();

  return (
    <>
      <BookChaptersModal />
      <NoteLinkBlinker />
      <CharacterNotesPanel />
    </>
  );
}

export default function App() {
  /* kick the imperative bootstrap once */
  useEffect(() => {
    runLegacyInit();
  }, []);

  return (
    <LocationProvider>
      <Shell />
    </LocationProvider>
  );
}
