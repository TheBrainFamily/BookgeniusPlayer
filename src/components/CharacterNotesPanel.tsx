import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { useDebounce } from "@/src/hooks/useDebounce";
import { useCharacterNotes } from "@/src/hooks/useCharacterNotes";
import { CharacterCard } from "./CharacterCard";

import { useLocation } from "@/src/state/LocationContext";
import { activateCharacters } from "@/src/ui/characterHelpers";
import { getCurrentBookSlug } from "@/src/getCurrentBookSlug";

/* render into legacy container so CSS keeps working */
const target = document.getElementById("left-notes");

export const CharacterNotesPanel: React.FC = () => {
  const { location } = useLocation();
  const debouncedLoc = useDebounce(location, 120); // ≈ original behaviour
  const notes = useCharacterNotes(debouncedLoc);

  /* fade‑in effect */
  const [fadeIn, setFadeIn] = useState(false);
  useEffect(() => {
    setFadeIn(false);
    const id = requestAnimationFrame(() => setFadeIn(true));
    return () => cancelAnimationFrame(id);
  }, [notes]);

  /* mark characters (talking + present) once list is ready */
  useEffect(() => {
    if (notes.length === 0) return;
    activateCharacters(
      debouncedLoc.chapter,
      debouncedLoc.paragraph,
      getCurrentBookSlug(),
      debouncedLoc.chapter,
      debouncedLoc.paragraph,
      false, // highlight also non‑talking characters present in range
    );
  }, [debouncedLoc.chapter, debouncedLoc.paragraph, notes]);

  if (!target) return null;

  return createPortal(
    <div
      className={`entity-notes-container${fadeIn ? " fade-in" : ""}`}
      /* force remount when chapter changes so stagger anim stays nice */
      key={`c${debouncedLoc.chapter}`}
    >
      {notes.map((n) => (
        <CharacterCard key={n.canonicalName} entity={n} />
      ))}
    </div>,
    target,
  );
};
