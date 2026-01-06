import { useEffect, useState } from "react";

type VisualViewportState = { height: number; top: number; isKeyboardOpen: boolean };

export function useVisualViewport(): VisualViewportState {
  const initialState: VisualViewportState =
    typeof window === "undefined"
      ? { height: 0, top: 0, isKeyboardOpen: false }
      : {
          height: window.visualViewport?.height ?? window.innerHeight,
          top: window.visualViewport?.offsetTop ?? 0,
          isKeyboardOpen:
            window.innerHeight -
              ((window.visualViewport?.height ?? window.innerHeight) +
                (window.visualViewport?.offsetTop ?? 0)) >
            80,
        };

  const [viewportState, setViewportState] = useState<VisualViewportState>(initialState);

  useEffect(() => {
    const update = () => {
      const vvapi = window.visualViewport;
      const height = vvapi?.height ?? window.innerHeight;
      const top = vvapi?.offsetTop ?? 0;
      const keyboardOffset = Math.max(0, window.innerHeight - (height + top));
      const isKeyboardOpen = keyboardOffset > 80;

      setViewportState({ height, top, isKeyboardOpen });

      const root = document.documentElement;
      root.style.setProperty("--vvh", `${height}px`);
      root.style.setProperty("--vvtop", `${top}px`);
      root.style.setProperty("--kb", `${keyboardOffset}px`);
      root.classList.toggle("keyboard-open", isKeyboardOpen);
    };

    update();
    const vvapi = window.visualViewport;
    vvapi?.addEventListener("resize", update);
    vvapi?.addEventListener("scroll", update);
    window.addEventListener("orientationchange", update);

    return () => {
      vvapi?.removeEventListener("resize", update);
      vvapi?.removeEventListener("scroll", update);
      window.removeEventListener("orientationchange", update);
      document.documentElement.classList.remove("keyboard-open");
    };
  }, []);

  return viewportState;
}
