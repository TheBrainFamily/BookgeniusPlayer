import { useEffect, useCallback } from "react";
import { useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import { useEditorModeModal } from "@player/stores/modals/editorModeModal.store";
import { useBookConvex } from "@player/context/BookConvexContext";
import { setOpenTalkingCharacterModal, setOpenEditCharacterTagModal, setOpenWrapWithCharacterModal } from "@player/ui/paragraphHighlighting";
import { useEditModeGlobalSync } from "@player/context/EditModeContext";
import { optimisticWrapTextWithCharacter, optimisticModifyCharacterTag, optimisticSetTalkingCharacter } from "@player/ui/optimisticDom";

export function ParagraphEditConnector() {
  useEditModeGlobalSync();

  const { openTalkingCharacterModal, openEditCharacterTagModal, openWrapWithCharacterModal } = useEditorModeModal();
  const { book, characters } = useBookConvex();
  const setParagraphSpeaker = useAction(api.paragraphEditor.setParagraphSpeaker);
  const modifyCharacterTag = useAction(api.paragraphEditor.modifyCharacterTag);
  const wrapTextWithCharacter = useAction(api.paragraphEditor.wrapTextWithCharacter);

  const getAvatarUrl = useCallback(
    (characterSlug: string): string | undefined => {
      const character = characters.find((c) => c.slug.toLowerCase() === characterSlug.toLowerCase());
      return character?.avatar?.url;
    },
    [characters],
  );

  const handleOpenTalkingModal = useCallback(
    (chapterNumber: number, paragraphIndex: number, currentSpeaker: string | null) => {
      const bookPath = book?.path;
      if (!bookPath) {
        console.error("[ParagraphEditConnector] Book path not available");
        return;
      }

      openTalkingCharacterModal(chapterNumber, paragraphIndex, currentSpeaker, async (characterSlug?: string) => {
        const avatarUrl = characterSlug ? getAvatarUrl(characterSlug) : undefined;
        const revert = optimisticSetTalkingCharacter(chapterNumber, paragraphIndex, characterSlug, avatarUrl);
        try {
          await setParagraphSpeaker({ bookPath, chapterNumber, paragraphIndex, characterSlug: characterSlug || undefined });
        } catch (error) {
          revert?.();
          throw error;
        }
      });
    },
    [book?.path, openTalkingCharacterModal, setParagraphSpeaker, getAvatarUrl],
  );

  const handleOpenEditCharacterTagModal = useCallback(
    (chapterNumber: number, paragraphIndex: number, characterSlug: string, textContent: string) => {
      const bookPath = book?.path;
      if (!bookPath) {
        console.error("[ParagraphEditConnector] Book path not available");
        return;
      }

      openEditCharacterTagModal(chapterNumber, paragraphIndex, characterSlug, textContent, async (newCharacterSlug?: string) => {
        const revert = optimisticModifyCharacterTag(chapterNumber, paragraphIndex, characterSlug, textContent, newCharacterSlug);
        try {
          await modifyCharacterTag({ bookPath, chapterNumber, paragraphIndex, currentCharacterSlug: characterSlug, textContent, newCharacterSlug: newCharacterSlug || undefined });
        } catch (error) {
          revert?.();
          throw error;
        }
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
        const revert = optimisticWrapTextWithCharacter(chapterNumber, paragraphIndex, selectedText, occurrenceIndex, characterSlug);
        try {
          await wrapTextWithCharacter({ bookPath, chapterNumber, paragraphIndex, textToWrap: selectedText, occurrenceIndex, characterSlug });
        } catch (error) {
          revert?.();
          throw error;
        }
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
