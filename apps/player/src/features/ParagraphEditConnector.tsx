import { useEffect, useCallback } from "react";
import { useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import { useEditorModeModal } from "@player/stores/modals/editorModeModal.store";
import { useBookConvex } from "@player/context/BookConvexContext";
import { setOpenTalkingCharacterModal } from "@player/ui/paragraphHighlighting";
import { useEditModeGlobalSync } from "@player/context/EditModeContext";

export function ParagraphEditConnector() {
  useEditModeGlobalSync();

  const { openTalkingCharacterModal } = useEditorModeModal();
  const { book } = useBookConvex();
  const setParagraphSpeaker = useAction(api.paragraphEditor.setParagraphSpeaker);

  const handleOpenModal = useCallback(
    (chapterNumber: number, paragraphIndex: number, currentSpeaker: string | null) => {
      const bookPath = book?.path;
      if (!bookPath) {
        console.error("[ParagraphEditConnector] Book path not available");
        return;
      }

      openTalkingCharacterModal(chapterNumber, paragraphIndex, currentSpeaker, async (characterSlug?: string) => {
        await setParagraphSpeaker({ bookPath, chapterNumber, paragraphIndex, characterSlug: characterSlug || undefined });
      });
    },
    [book?.path, openTalkingCharacterModal, setParagraphSpeaker],
  );

  useEffect(() => {
    setOpenTalkingCharacterModal(handleOpenModal);

    return () => {
      setOpenTalkingCharacterModal(() => {});
    };
  }, [handleOpenModal]);

  return null;
}
