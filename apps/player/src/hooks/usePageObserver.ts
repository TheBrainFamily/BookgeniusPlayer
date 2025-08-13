import { useEffect, useRef, useCallback } from "react";
import { setupPageObserver } from "@/ui/pageObserver";

interface UsePageObserverOptions {
  /** Whether the observer should be active */
  enabled: boolean;
  /** Stable callback coming from ModalContext */
  openCharacterDetailsModal: (characterSlug: string, isTalking: boolean, src: string) => void;
}

/**
 * React-idiomatic wrapper around the legacy `setupPageObserver` util.
 *
 * It takes care of:
 *  • creating the IntersectionObserver once `enabled` becomes true
 *  • cleaning it up automatically on unmount or when `enabled` turns false
 *  • exposing `observeNewParagraphs` and `cleanupRemovedParagraphs` helpers
 */
export const usePageObserver = ({ enabled, openCharacterDetailsModal }: UsePageObserverOptions) => {
  type LegacyObserver = NonNullable<ReturnType<typeof setupPageObserver>>;
  const legacyRef = useRef<LegacyObserver | null>(null);

  /* ------------------------------------------------------------------ */
  /*  (Re)create / teardown observer when `enabled` changes               */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    if (!enabled) {
      // Teardown if we previously had one
      if (legacyRef.current) {
        legacyRef.current.observer.disconnect();
        legacyRef.current = null;
      }
      return;
    }

    // Already initialised – nothing to do
    if (legacyRef.current) return;

    createObserver();

    // Cleanup on unmount
    return () => {
      if (legacyRef.current) {
        legacyRef.current.observer.disconnect();
        legacyRef.current = null;
      }
    };
  }, [enabled, openCharacterDetailsModal]);

  /* ------------------------------------------------------------------ */
  /*  Public helpers                                                     */
  /* ------------------------------------------------------------------ */
  const createObserver = useCallback(() => {
    if (!enabled) return null;
    const result = setupPageObserver(openCharacterDetailsModal);
    if (result) legacyRef.current = result;
    return legacyRef.current;
  }, [enabled, openCharacterDetailsModal]);

  const observeNewParagraphs = useCallback(() => {
    if (!legacyRef.current) {
      // paragraphs might not have been ready during initial attempt – try again now
      createObserver();
    }
    return legacyRef.current?.observeNewParagraphs() ?? 0;
  }, [createObserver]);

  const cleanupRemovedParagraphs = useCallback(() => {
    if (!legacyRef.current) return 0;
    return legacyRef.current.cleanupRemovedParagraphs();
  }, []);

  return { observeNewParagraphs, cleanupRemovedParagraphs };
};
