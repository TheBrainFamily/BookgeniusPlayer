import React, { useEffect, useState } from "react";
import { preloadAllBookData } from "@player/services/bookDataPreloader";

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
