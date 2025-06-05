/**
 * A super‑thin React wrapper around the old initializeNoteLinkBlinking().
 * * When you decide to fully migrate it you’ll only have to copy the code
 * into this component instead of keeping the DOM query logic elsewhere.
 */
import { useEffect } from "react";
import { initializeNoteLinkBlinking } from "@/annotationsHandling";

export default function NoteLinkBlinker() {
  useEffect(() => {
    initializeNoteLinkBlinking();
  }, []);

  return null; // nothing to render
}
