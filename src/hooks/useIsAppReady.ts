import { useEffect, useState } from "react";

/**
 * Hook that provides the app ready state by listening to the "appReady" custom event.
 *
 * This is a consumer hook that works with the `useAppReady` hook which dispatches
 * the "appReady" event when the app initialization is complete (videos loaded, etc.).
 *
 * @returns boolean indicating whether the app is ready
 */
export function useIsAppReady(): boolean {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const handleAppReady = () => {
      setIsReady(true);
    };

    window.addEventListener("appReady", handleAppReady);

    return () => {
      window.removeEventListener("appReady", handleAppReady);
    };
  }, []);

  return isReady;
}
