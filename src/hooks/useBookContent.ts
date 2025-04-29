import { useEffect } from "react";

export function useBookContent(htmlContent: string, containerId: string) {
  useEffect(() => {
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = htmlContent;
    } else {
      console.warn(`Container with id '${containerId}' not found for content injection.`);
    }

    // Optional cleanup: Clear content when component unmounts
    // return () => {
    //   if (container) {
    //     container.innerHTML = '';
    //   }
    // };
  }, [htmlContent, containerId]); // Rerun if content or ID changes
}
