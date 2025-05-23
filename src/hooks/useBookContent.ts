import { useEffect } from "react";
import { handleRemoveCharacter } from "@/text-editor-service/listeners/handleRemoveCharacter";
import { handleEditParagraph } from "@/text-editor-service/listeners/handleEditParagraph";

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
        if (event.metaKey) {
          const target = event.target as HTMLElement;
          let chapterNumber: number = null;
          let paragraphNumber: number = null;

          const paragraphTag = target.getAttribute("data-index");
          const characterTag = target.getAttribute("data-character");

          if (paragraphTag) {
            chapterNumber = parseInt((target.parentNode as HTMLElement).attributes["data-chapter"].value);
            paragraphNumber = parseInt(target.attributes["data-index"].value);
            const response = confirm("Are you sure you want to edit this content?");

            if (response) {
              return handleEditParagraph(chapterNumber, paragraphNumber);
            }
            return;
          }

          if (characterTag) {
            paragraphNumber = parseInt((target.parentNode as HTMLElement).attributes["data-index"].value);
            chapterNumber = parseInt((target.parentNode.parentNode as HTMLElement).attributes["data-chapter"].value);
            const response = confirm(`Are you sure you want to remove ${characterTag}?`);
            if (response) {
              return handleRemoveCharacter(target, chapterNumber, paragraphNumber, characterTag);
            }
            return;
          }
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
