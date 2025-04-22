import React, { useEffect } from "react";

import { LocationProvider } from "./state/LocationContext";
import { usePageObserver } from "./hooks/usePageObserver";

import BookChaptersModal from "./menu-modal";
import NoteLinkBlinker from "./react-bridge/NoteLinkBlinker";
import { runLegacyInit } from "./main";

function Shell() {
  /* side‑effects that depend on scroll position */
  usePageObserver();

  return (
    <>
      <BookChaptersModal />
      <NoteLinkBlinker />
    </>
  );
}

export default function App() {
  /* -----------------------------------------------------------
   * Kick the legacy bootstrap ONCE.
   * (Parent effect → executed before children effects,
   * so updateParagraphNotes is ready when usePageObserver runs.)
   * ----------------------------------------------------------- */
  useEffect(() => {
    runLegacyInit();
  }, []);

  return (
    <LocationProvider>
      <Shell />
    </LocationProvider>
  );
}
