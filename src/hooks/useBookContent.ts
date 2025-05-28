import { useEffect } from "react";
import { handleRemoveCharacter } from "@/text-editor-service/listeners/handleRemoveCharacter";
import { handleAddCharacter } from "@/text-editor-service/listeners/handleAddCharacter";
import { useModal } from "@/context/ModalContext";
import { handleEditParagraph } from "@/text-editor-service/listeners/handleEditParagraph";

export function useBookContent(htmlContent: string, containerId: string) {
  const { openEditorModeModal } = useModal();

  useEffect(() => {
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = htmlContent.replace(/<\/section>(?!.*<\/section>)/s, '<div style="height: 50vh;"></div></section>');
    } else {
      console.warn(`Container with id '${containerId}' not found for content injection.`);
    }

    if (import.meta.env.VITE_EDITOR === "true") {
      const handleClick = async (event: MouseEvent) => {
        const target = event.target as HTMLElement;

        const paragraphTag = target.closest("[data-index]");
        const chapterTag = target.closest("[data-chapter]");
        const chapterNumber = parseInt((chapterTag as HTMLElement).attributes["data-chapter"].value);
        const paragraphNumber = parseInt(paragraphTag.attributes["data-index"].value);
        const characterTag = target.getAttribute("data-character");

        if (paragraphTag && !characterTag) {
          if (!event.metaKey && event.altKey) {
            return openEditorModeModal("add-character", (characterSlug: string) => handleAddCharacter(target, chapterNumber, paragraphNumber, characterSlug));
          }

          if (event.metaKey && !event.altKey) {
            return handleEditParagraph(chapterNumber, paragraphNumber);
          }
        }

        if (event.metaKey && !event.altKey && characterTag) {
          return handleRemoveCharacter(target, chapterNumber, paragraphNumber, characterTag);
        }
      };

      container?.addEventListener("click", handleClick);

      // Clean up the event listener when the component unmounts or when dependencies change
      return () => {
        container?.removeEventListener("click", handleClick);
      };
    }
  }, [htmlContent, containerId]); // Rerun if content or ID changes
}
