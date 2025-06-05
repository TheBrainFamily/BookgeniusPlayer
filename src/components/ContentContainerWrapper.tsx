import { useEffect } from "react";
import useSplashHidden from "@/hooks/useSplashHidden";

const ContentContainerWrapper = () => {
  const isSplashHidden = useSplashHidden();

  useEffect(() => {
    const target = document.getElementById("content-container");
    if (!target) return;

    if (!isSplashHidden) {
      target.style.opacity = "0";
      target.style.transform = "scale(0.95)";
      return;
    }

    target.style.opacity = "0";
    target.style.transform = "scale(0.95)";
    target.style.transition = "opacity 0.7s ease-out, transform 0.7s ease-out";

    // Use RAF to ensure styles are applied before the animation starts
    requestAnimationFrame(() => {
      setTimeout(() => {
        target.style.opacity = "1";
        target.style.transform = "scale(1)";
      }, 250);
    });

    return () => {
      if (!target) {
        target.style.transition = "";
        target.style.opacity = "";
        target.style.transform = "";
      }
    };
  }, [isSplashHidden]);

  return null; // This component doesn't render anything, it just applies animation to existing DOM
};

export default ContentContainerWrapper;
