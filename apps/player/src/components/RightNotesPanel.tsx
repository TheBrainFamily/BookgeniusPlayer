import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";

import { useFootnotes } from "@player/hooks/useFootnotes";
import { FootnoteModal } from "./FootnoteModal";
import { useLocationRange } from "@player/hooks/useLocationRange";

const target = document.getElementById("right-notes");

export const RightNotesPanel: React.FC = () => {
  const { locationRange } = useLocationRange();
  const notes = useFootnotes(locationRange);
  /* modal */
  const [modalHtml, setModalHtml] = useState<string | null>(null);

  const open = (html: string) => setModalHtml(html);
  const close = () => setModalHtml(null);

  // Listen for custom event to open footnote modal
  useEffect(() => {
    const handleOpenFootnoteModal = (event: CustomEvent<{ html: string }>) => {
      open(event.detail.html);
    };

    window.addEventListener("open-footnote-modal", handleOpenFootnoteModal as EventListener);

    return () => {
      window.removeEventListener("open-footnote-modal", handleOpenFootnoteModal as EventListener);
    };
  }, []);

  if (!target) return null;

  return createPortal(
    <>
      <div className="py-10 content-center h-full space-y-3 overflow-x-hidden no-scrollbar" style={{ overflowY: "auto" }}>
        {notes.map((n) => (
          <section key={n.id} className="right-note" onClick={() => open(n.html)} dangerouslySetInnerHTML={{ __html: n.html }} style={{ cursor: "pointer" }} />
        ))}
        {notes.length === 0 && <p style={{ opacity: 0.1, padding: "1rem" }}>&nbsp;</p>}
      </div>

      <FootnoteModal open={!!modalHtml} html={modalHtml || ""} onClose={close} />
    </>,
    target,
  );
};
