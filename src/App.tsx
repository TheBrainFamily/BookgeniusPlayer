import React, { useEffect } from "react";

import BookChaptersModal from "./menu-modal"; // <-- already a React component
import NoteLinkBlinker from "./react-bridge/NoteLinkBlinker"; // tiny helper below
import { runLegacyInit } from "./main"; // vanilla bootstrap wrapped in a function

export default function App() {
  /* Kick the old vanilla bootstrap only once */
  useEffect(() => {
    runLegacyInit();
  }, []);

  return (
    <>
      {/* All legacy DOM nodes will still be manipulated directly,
          but from now on we can progressively replace them with React. */}

      {/* 1. Existing React UI (modal, etc.) */}
      <BookChaptersModal />

      {/* 2. One‑liner React hook that wires the old “annotationsHandling.ts” listeners */}
      <NoteLinkBlinker />
    </>
  );
}
