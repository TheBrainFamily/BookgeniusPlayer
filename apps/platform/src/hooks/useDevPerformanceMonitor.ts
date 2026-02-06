import { useEffect } from "react";

let perfMonitorInitialized = false;

export function useDevPerformanceMonitor(scope = "platform") {
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (import.meta.env.VITE_ENABLE_PERF_MONITOR !== "true") return;
    if (perfMonitorInitialized) return;

    perfMonitorInitialized = true;
    console.info(`[Perf][${scope}] monitor enabled`);

    const cleanups: Array<() => void> = [];

    if ("PerformanceObserver" in window) {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration >= 50) {
              console.warn(`[Perf][${scope}] long task ${entry.duration.toFixed(1)}ms`);
            }
          }
        });
        observer.observe({ entryTypes: ["longtask"] });
        cleanups.push(() => observer.disconnect());
      } catch {
        // Ignore browsers that don't support longtask entries.
      }
    }

    let rafId = 0;
    let frames = 0;
    let start = performance.now();
    const loop = (now: number) => {
      frames += 1;
      const elapsed = now - start;
      if (elapsed >= 1000) {
        const fps = (frames * 1000) / elapsed;
        if (fps < 45) {
          console.warn(`[Perf][${scope}] low FPS ${fps.toFixed(1)}`);
        }
        frames = 0;
        start = now;
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    cleanups.push(() => cancelAnimationFrame(rafId));

    return () => {
      for (const cleanup of cleanups) cleanup();
      perfMonitorInitialized = false;
    };
  }, [scope]);
}
