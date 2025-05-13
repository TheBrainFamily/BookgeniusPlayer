/**
 * Wraps the existing vanilla `setupPageObserver` in a React‑friendly hook.
 * You still get all original behaviour, but the hook registers only once
 * and benefits from Fast‑Refresh.
 */
import { useEffect } from "react";

import { setupPageObserver } from "@/ui/pageObserver";
import { ModalContextType } from "@/context/ModalContext";

export const usePageObserver = (htmlContent: string, modal: ModalContextType) => {
  useEffect(() => {
    console.log("setting up page observer due to content change");
    const observer = setupPageObserver(modal);

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
