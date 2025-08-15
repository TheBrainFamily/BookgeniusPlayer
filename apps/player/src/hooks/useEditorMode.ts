import { useEffect } from "react";
import { handleRemoveCharacter } from "@player/text-editor-service/listeners/handleRemoveCharacter";
import { useEditorModeModal } from "@player/stores/modals/editorModeModal.store";
import { WindowManager } from "@player/utils/WindowManager";

export function useEditorMode(container: HTMLElement | null) {
  const { openModal } = useEditorModeModal();
  const windowManager = new WindowManager();

  const urlParams = new URLSearchParams(window.location.search);
  const bookName = urlParams.get("book");

  useEffect(() => {
    if (!container) return;

    const handleClick = async (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      const paragraphTag = target.closest("[data-index]");
      const chapterTag = target.closest("[data-chapter]");
      const chapterNumber = parseInt((chapterTag as HTMLElement).attributes["data-chapter"].value);
      const paragraphNumber = parseInt(paragraphTag.attributes["data-index"].value);
      const characterTag = target.getAttribute("data-character");

      if (event.metaKey && !event.altKey) {
        try {
          const response = await fetch("http://localhost:3000/api/text-editor/sse/select-paragraph", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bookName: bookName, chapterId: chapterNumber, paragraphId: paragraphNumber }),
          });

          if (!response.ok) {
            console.error(`API call failed with status: ${response.status}`);
          }
        } catch (error) {
          console.error("Failed to send paragraph selection:", error);
        }

        windowManager.openOrUpdateApp(bookName, chapterNumber);
      }

      if (event.metaKey && !event.altKey && characterTag) {
        return handleRemoveCharacter(target, chapterNumber, paragraphNumber, characterTag, bookName);
      }
    };

    container.addEventListener("click", handleClick);

    return () => {
      container.removeEventListener("click", handleClick);
    };
  }, [container, openModal]);
}
