import { useEffect } from "react";
import { handleRemoveCharacter } from "@/text-editor-service/listeners/handleRemoveCharacter";
import { handleEditParagraph } from "@/text-editor-service/listeners/handleEditParagraph";
import { handleAddCharacter } from "@/text-editor-service/listeners/handleAddCharacter";

export function useBookContent(htmlContent: string, containerId: string) {
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
            const target = event.target as HTMLElement;
            const response = confirm("Are you sure you want to add the CHARACTER_NAME here?");

            if (response) {
              return handleAddCharacter(target, chapterNumber, paragraphNumber);
            }
            return;
          }

          if (event.metaKey && !event.altKey) {
            const response = confirm("Are you sure you want to edit this paragraph?");

            if (response) {
              return handleEditParagraph(chapterNumber, paragraphNumber);
            }
            return;
          }
        }

        if (event.metaKey && !event.altKey && characterTag) {
          const response = confirm(`Are you sure you want to remove ${characterTag}?`);
          if (response) {
            return handleRemoveCharacter(target, chapterNumber, paragraphNumber, characterTag);
          }
          return;
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
