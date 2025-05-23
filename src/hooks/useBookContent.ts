import { useEffect } from "react";
export function useBookContent(htmlContent: string, containerId: string) {
  useEffect(() => {
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = htmlContent.replace(/<\/section>(?!.*<\/section>)/s, '<div style="height: 50vh;"></div></section>');
    } else {
      console.warn(`Container with id '${containerId}' not found for content injection.`);
    }

    const handleClick = async (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (event.metaKey && target.tagName === "P") {
        // Handle cmd + click on paragraph
        event.preventDefault();
        event.stopPropagation();

        const chapter = (target.parentNode as HTMLElement).attributes["data-chapter"].value;
        const paragraph = target.attributes["data-index"].value;

        await fetch(`http://localhost:3000/api/text-editor/character`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chapterNumber: chapter, paragraphNumber: paragraph, updatedParagraphText: `ss` }),
        });
      }
    };

    container?.addEventListener("click", handleClick);

    // Clean up the event listener when the component unmounts or when dependencies change
    return () => {
      container?.removeEventListener("click", handleClick);
    };
  }, [htmlContent, containerId]); // Rerun if content or ID changes
}
