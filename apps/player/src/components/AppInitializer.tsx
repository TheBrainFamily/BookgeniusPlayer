import React, { useEffect, useState } from "react";
import { preloadAllBookData } from "@player/services/bookDataPreloader";
import { getBackgroundsForBook } from "@player/genericBookDataGetters/getBackgroundsForBook";

interface AppInitializerProps {
  children: React.ReactNode;
}

export function AppInitializer({ children }: AppInitializerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function initializeApp() {
      try {
        await preloadAllBookData();

        const backgroundsEmpty = getBackgroundsForBook().length === 0;
        const legacyEl = document.getElementById("legacy") as HTMLElement;
        const contentContainerEl = document.querySelector("#legacy #content-container") as HTMLElement;
        if (backgroundsEmpty) {
          legacyEl.style.backgroundColor = "lightgray";
          contentContainerEl.style.setProperty("mask-image", "none");
          contentContainerEl.style.setProperty("-webkit-mask-image", "none");
        } else {
          legacyEl.style.backgroundColor = "black";
          contentContainerEl.style.removeProperty("mask-image");
          contentContainerEl.style.removeProperty("-webkit-mask-image");
        }

        setIsLoading(false);
      } catch (err) {
        console.error("Failed to initialize app:", err);
        setError(err instanceof Error ? err.message : "Failed to load book data");
        setIsLoading(false);
      }
    }

    initializeApp();
  }, []);

  if (isLoading || error) {
    return null;
  }

  return <>{children}</>;
}
