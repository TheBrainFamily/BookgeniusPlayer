import { useEffect } from "react";
import { handleRemoveCharacter } from "@/text-editor-service/listeners/handleRemoveCharacter";
import { handleAddCharacter } from "@/text-editor-service/listeners/handleAddCharacter";
import { useModal } from "@/context/ModalContext";
import { handleEditParagraph } from "@/text-editor-service/listeners/handleEditParagraph";
import { handleAddMusicShiftParagraph } from "@/text-editor-service/listeners/handleAddMusicShiftParagraph";
import { handleRemoveMusicShift } from "@/text-editor-service/listeners/handleRemoveMusicShift";

export function useBookContent(htmlContent: string, containerId: string) {
  const { openEditorModeModal } = useModal();

  useEffect(() => {
    const container = document.getElementById(containerId);
    if (container) {
      // Process editor-only elements before injecting content
      const processedContent = htmlContent.replace(/<\/section>(?!.*<\/section>)/s, '<div style="height: 50vh;"></div></section>');

      // Handle editor-only elements
      if (import.meta.env.VITE_EDITOR !== "true") {
        // Remove all elements with data-editor-only attribute
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = processedContent;
        const editorOnlyElements = tempDiv.querySelectorAll('[data-editor-mode="true"]');
        editorOnlyElements.forEach((element) => element.remove());
        container.innerHTML = tempDiv.innerHTML;
      } else {
        container.innerHTML = processedContent;
      }
    } else {
      console.warn(`Container with id '${containerId}' not found for content injection.`);
    }

    if (import.meta.env.VITE_EDITOR === "true") {
      let mKeyPressed = false;

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
            return openEditorModeModal("add-character", (characterSlug: string) => handleAddCharacter(target, chapterNumber, paragraphNumber, characterSlug));
          }

          if (event.metaKey && !event.altKey) {
            return handleEditParagraph(chapterNumber, paragraphNumber);
          }

          if (mKeyPressed) {
            return handleAddMusicShiftParagraph(chapterNumber, paragraphNumber);
          }
        }

        if (event.metaKey && !event.altKey && characterTag) {
          return handleRemoveCharacter(target, chapterNumber, paragraphNumber, characterTag);
        }

        if (mKeyPressed && musicShiftTag) {
          return handleRemoveMusicShift(chapterNumber, paragraphNumber);
        }
      };

      const handleKeyDown = (event) => {
        if (event.key === "m" || event.key === "M") {
          mKeyPressed = true;
        }
      };

      const handleKeyUp = (event) => {
        if (event.key === "m" || event.key === "M") {
          mKeyPressed = false;
        }
      };

      document?.addEventListener("keydown", handleKeyDown);
      document?.addEventListener("keyup", handleKeyUp);
      container?.addEventListener("click", handleClick);

      // Clean up the event listener when the component unmounts or when dependencies change
      return () => {
        container?.removeEventListener("click", handleClick);
        document?.removeEventListener("keydown", handleKeyDown);
        document?.removeEventListener("keyup", handleKeyUp);
      };
    }
  }, [htmlContent, containerId]); // Rerun if content or ID changes
}
