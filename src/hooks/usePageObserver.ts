/**
 * Wraps the existing vanilla `setupPageObserver` in a React‑friendly hook.
 * You still get all original behaviour, but the hook registers only once
 * and benefits from Fast‑Refresh.
 */
import { useEffect } from "react";
import { setupPageObserver } from "@/src/ui/pageObserver";

export const usePageObserver = (htmlContent: string) => {
  useEffect(() => {
    console.log("setting up page observer due to content change");
    const observer = setupPageObserver();

    // Cleanup function to disconnect the observer when the component unmounts
    // or before the effect runs again due to content change.
    return () => {
      if (observer) {
        console.log("disconnecting page observer due to content change or unmount");
        observer.disconnect();
      }
    };
  }, [htmlContent]); // Dependency array includes htmlContent
};
