import { useEffect } from "react";
import { textCacheManager } from "@player/logic/TextCacheManager";
import { useLocationRange } from "./useLocationRange";

export const useTextCacheManager = () => {
  const { debouncedLocation } = useLocationRange();

  useEffect(() => {
    textCacheManager.initialize();
  }, []);

  useEffect(() => {
    if (debouncedLocation) {
      if ("requestIdleCallback" in window) {
        window.requestIdleCallback(() => {
          textCacheManager.ensureCacheUpto(debouncedLocation.chapter, debouncedLocation.paragraph);
        });
      } else {
        setTimeout(() => {
          textCacheManager.ensureCacheUpto(debouncedLocation.chapter, debouncedLocation.paragraph);
        }, 100);
      }
    }
  }, [debouncedLocation]);
};
