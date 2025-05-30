import { useEffect, useRef } from "react";
import { handleAddCharacter } from "@/text-editor-service/listeners/handleAddCharacter";
import { handleEditParagraph } from "@/text-editor-service/listeners/handleEditParagraph";
import { handleAddMusicShiftParagraph } from "@/text-editor-service/listeners/handleAddMusicShiftParagraph";
import { handleRemoveCharacter } from "@/text-editor-service/listeners/handleRemoveCharacter";
import { handleRemoveMusicShift } from "@/text-editor-service/listeners/handleRemoveMusicShift";
import { useEditorModeModal } from "@/stores/modals/editorModeModal.store";

export function useEditorMode(container: HTMLElement | null) {
  const mKeyPressed = useRef(false);
  const { openModal } = useEditorModeModal();

  useEffect(() => {
    if (!container) return;

    const handleClick = async (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      const paragraphTag = target.closest("[data-index]");
      const chapterTag = target.closest("[data-chapter]");
      const chapterNumber = parseInt((chapterTag as HTMLElement).attributes["data-chapter"].value);
      const paragraphNumber = parseInt(paragraphTag.attributes["data-index"].value);
      const characterTag = target.getAttribute("data-character");
      const musicShiftTag = target.getAttribute("data-editor-tag") === "musicShift";

      if (paragraphTag && !characterTag && !musicShiftTag) {
        if (!event.metaKey && event.altKey) {
          return openModal("add-character", (characterSlug: string) => handleAddCharacter(target, chapterNumber, paragraphNumber, characterSlug));
        }

        if (event.metaKey && !event.altKey) {
          return handleEditParagraph(chapterNumber, paragraphNumber);
        }

        if (mKeyPressed.current) {
          return handleAddMusicShiftParagraph(chapterNumber, paragraphNumber);
        }
      }

      if (event.metaKey && !event.altKey && characterTag) {
        return handleRemoveCharacter(target, chapterNumber, paragraphNumber, characterTag);
      }

      if (mKeyPressed.current && musicShiftTag) {
        return handleRemoveMusicShift(chapterNumber, paragraphNumber);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "m" || event.key === "M") {
        mKeyPressed.current = true;
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === "m" || event.key === "M") {
        mKeyPressed.current = false;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);
    container.addEventListener("click", handleClick);

    return () => {
      container.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
    };
  }, [container, openModal]);
}
