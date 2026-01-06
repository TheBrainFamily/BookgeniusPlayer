import { useEffect, useRef } from "react";
import { useBookConvex } from "@player/context/BookConvexContext";
import { getSavedLocation } from "@player/helpers/paragraphsNavigation";
import { textCacheManager } from "@player/logic/TextCacheManager";
import { useIsAppReady } from "./useIsAppReady";

export function usePostReadyPrefetch() {
  const isAppReady = useIsAppReady();
  const { prefetchChaptersUpTo } = useBookConvex();
  const didPrefetchRef = useRef(false);

  useEffect(() => {
    if (!isAppReady || didPrefetchRef.current) return;
    didPrefetchRef.current = true;

    const saved = getSavedLocation();
    const targetChapter = Math.max(
      saved.currentChapter ?? 1,
      saved.latestVisibleChapter ?? 0,
      saved.endChapter ?? 0,
      saved.chapter ?? 1,
    );
    const targetParagraph = saved.currentParagraph ?? saved.paragraph ?? 1;

    void (async () => {
      await Promise.all([prefetchChaptersUpTo(targetChapter)]);
      const warmTextCache = () => {
        textCacheManager.ensureCacheUpto(targetChapter, targetParagraph);
      };
      if ("requestIdleCallback" in window) {
        window.requestIdleCallback(warmTextCache);
      } else {
        setTimeout(warmTextCache, 100);
      }
    })();
  }, [isAppReady, prefetchChaptersUpTo]);
}
