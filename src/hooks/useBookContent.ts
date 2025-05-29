import { useEffect } from "react";
import { useEditorMode } from "@/hooks/useEditorMode";

export function useBookContent(htmlContent: string, containerId: string) {
  const container = document.getElementById(containerId);
  const isEditorMode = import.meta.env.VITE_EDITOR === "true";

  useEditorMode(isEditorMode ? container : null);

  useEffect(() => {
    if (container) {
      // Process editor-only elements before injecting content
      const processedContent = htmlContent.replace(/<\/section>(?!.*<\/section>)/s, '<div style="height: 50vh;"></div></section>');

      if (isEditorMode) {
        container.innerHTML = processedContent;
      } else {
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = processedContent;
        const editorOnlyElements = tempDiv.querySelectorAll('[data-editor-mode="true"]');
        editorOnlyElements.forEach((element) => element.remove());
        container.innerHTML = tempDiv.innerHTML;
      }
    } else {
      console.warn(`Container with id '${containerId}' not found for content injection.`);
    }
  }, [htmlContent, containerId, container, isEditorMode]); // Rerun if content, ID, container, or editor mode changes
}
