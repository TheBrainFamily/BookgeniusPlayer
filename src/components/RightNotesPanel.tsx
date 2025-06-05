import React, { useState } from "react";
import { createPortal } from "react-dom";

import { useFootnotes } from "@/hooks/useFootnotes";
import { FootnoteModal } from "./FootnoteModal";
import { useLocationRange } from "@/hooks/useLocationRange";

const target = document.getElementById("right-notes");

export const RightNotesPanel: React.FC = () => {
  const { locationRange } = useLocationRange();
  const notes = useFootnotes(locationRange);
  /* modal */
  const [modalHtml, setModalHtml] = useState<string | null>(null);

  const open = (html: string) => setModalHtml(html);
  const close = () => setModalHtml(null);

  if (!target) return null;

  return createPortal(
    <>
      <div style={{ overflowY: "auto" }}>
        {notes.map((n) => (
          <section key={n.id} className="right-note" onClick={() => open(n.html)} dangerouslySetInnerHTML={{ __html: n.html }} style={{ cursor: "pointer" }} />
        ))}
        {notes.length === 0 && <p style={{ opacity: 0.6, padding: "1rem" }}>&nbsp;</p>}
      </div>

      <FootnoteModal open={!!modalHtml} html={modalHtml || ""} onClose={close} />
    </>,
    target,
  );
};
