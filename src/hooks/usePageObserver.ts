/**
 * Wraps the existing vanilla `setupPageObserver` in a React‑friendly hook.
 * You still get all original behaviour, but the hook registers only once
 * and benefits from Fast‑Refresh.
 */
import { useEffect } from "react";
import { setupPageObserver } from "@/src/ui/pageObserver";

export const usePageObserver = () => {
  useEffect(() => {
    setupPageObserver();
  }, []);
};
