import React from "react";
import { createPortal } from "react-dom";

import { useFootnotes } from "@player/hooks/useFootnotes";
import { useLocationRange } from "@player/hooks/useLocationRange";
import { useScreenSize } from "@player/hooks/useScreenSize";
import { useFootnoteModal } from "@player/stores/modals/footnoteModal.store";

const target = document.getElementById("right-notes");

export const RightNotesPanel: React.FC = () => {
  const { isLargeScreen } = useScreenSize();
  const { locationRange } = useLocationRange();
  const notes = useFootnotes(locationRange);
  const { openModal } = useFootnoteModal();

  if (!target || !isLargeScreen) return null;

  return createPortal(
    <div
      className="py-10 content-center h-full space-y-3 overflow-x-hidden no-scrollbar"
      style={{ overflowY: "auto", contain: "content" }}
    >
      {notes.map((n) => (
        <section
          key={n.id}
          className="right-note"
          onClick={() => openModal(n.html)}
          dangerouslySetInnerHTML={{ __html: n.html }}
          style={{ cursor: "pointer" }}
        />
      ))}
      {notes.length === 0 && <p style={{ opacity: 0.1, padding: "1rem" }}>&nbsp;</p>}
    </div>,
    target,
  );
};
