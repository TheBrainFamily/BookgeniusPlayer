import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "@/src/state/LocationContext";
import { useDebounce } from "@/src/hooks/useDebounce";
import { useFootnotes } from "@/src/hooks/src/hooks/useFootnotes";
import { FootnoteModal } from "./FootnoteModal";

const target = document.getElementById("right-notes");

export const RightNotesPanel: React.FC = () => {
  const loc = useLocation().location;
  const debounced = useDebounce(loc, 200);

  /* stable range object so children can memoise easily */
  const range = useMemo(
    () => ({ chapter: debounced.chapter, paragraph: debounced.paragraph, endChapter: debounced.endChapter, endParagraph: debounced.endParagraph }),
    [debounced.chapter, debounced.paragraph, debounced.endChapter, debounced.endParagraph],
  );

  const notes = useFootnotes(range);
  console.log("notes", notes);
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
