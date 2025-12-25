import { useEffect, useCallback } from "react";
import { useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import { useEditorModeModal } from "@player/stores/modals/editorModeModal.store";
import { useBookConvex } from "@player/context/BookConvexContext";
import { setOpenTalkingCharacterModal, setOpenEditCharacterTagModal, setOpenWrapWithCharacterModal } from "@player/ui/paragraphHighlighting";
import { useEditModeGlobalSync } from "@player/context/EditModeContext";

export function ParagraphEditConnector() {
  useEditModeGlobalSync();

  const { openTalkingCharacterModal, openEditCharacterTagModal, openWrapWithCharacterModal } = useEditorModeModal();
  const { book } = useBookConvex();
  const setParagraphSpeaker = useAction(api.paragraphEditor.setParagraphSpeaker);
  const modifyCharacterTag = useAction(api.paragraphEditor.modifyCharacterTag);
  const wrapTextWithCharacter = useAction(api.paragraphEditor.wrapTextWithCharacter);

  const handleOpenTalkingModal = useCallback(
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

  const handleOpenEditCharacterTagModal = useCallback(
    (chapterNumber: number, paragraphIndex: number, characterSlug: string, textContent: string) => {
      const bookPath = book?.path;
      if (!bookPath) {
        console.error("[ParagraphEditConnector] Book path not available");
        return;
      }

      openEditCharacterTagModal(chapterNumber, paragraphIndex, characterSlug, textContent, async (newCharacterSlug?: string) => {
        await modifyCharacterTag({ bookPath, chapterNumber, paragraphIndex, currentCharacterSlug: characterSlug, textContent, newCharacterSlug: newCharacterSlug || undefined });
      });
    },
    [book?.path, openEditCharacterTagModal, modifyCharacterTag],
  );

  const handleOpenWrapWithCharacterModal = useCallback(
    (chapterNumber: number, paragraphIndex: number, selectedText: string, occurrenceIndex: number) => {
      const bookPath = book?.path;
      if (!bookPath) {
        console.error("[ParagraphEditConnector] Book path not available");
        return;
      }

      openWrapWithCharacterModal(chapterNumber, paragraphIndex, selectedText, occurrenceIndex, async (characterSlug?: string) => {
        if (!characterSlug) return;
        await wrapTextWithCharacter({ bookPath, chapterNumber, paragraphIndex, textToWrap: selectedText, occurrenceIndex, characterSlug });
      });
    },
    [book?.path, openWrapWithCharacterModal, wrapTextWithCharacter],
  );

  useEffect(() => {
    setOpenTalkingCharacterModal(handleOpenTalkingModal);
    setOpenEditCharacterTagModal(handleOpenEditCharacterTagModal);
    setOpenWrapWithCharacterModal(handleOpenWrapWithCharacterModal);

    return () => {
      setOpenTalkingCharacterModal(() => {});
      setOpenEditCharacterTagModal(() => {});
      setOpenWrapWithCharacterModal(() => {});
    };
  }, [handleOpenTalkingModal, handleOpenEditCharacterTagModal, handleOpenWrapWithCharacterModal]);

  return null;
}
