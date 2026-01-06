import { useEffect, useRef, useState } from "react";
import { ChevronsUp, ChevronsDown } from "lucide-react";
import { useIsMobileOrTablet } from "@player/hooks/useIsMobileOrTablet";
import { useTranslation } from "react-i18next";

const FADE_DURATION_MS = 300;
const SCROLL_INDICATOR_SCROLL_MARGIN_PX = 320;

export const ScrollIndicator = () => {
  const [isMounted, setIsMounted] = useState(false);
  const [targetChapter, setTargetChapter] = useState<number | null>(null);
  const hideTimeoutRef = useRef<number | null>(null);

  const { t } = useTranslation();
  const isMobileOrTablet = useIsMobileOrTablet();

  useEffect(() => {
    const handleShow: EventListener = (event) => {
      if (!(event instanceof CustomEvent)) {
        return;
      }
      const detail = event.detail as { targetChapter?: number | null } | undefined;
      const nextTarget = detail?.targetChapter;
      setTargetChapter(
        typeof nextTarget === "number" && Number.isFinite(nextTarget) ? nextTarget : null,
      );

      if (hideTimeoutRef.current !== null) {
        window.clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }
      setIsMounted(true);
    };
    const handleHide: EventListener = () => {
      hideTimeoutRef.current = window.setTimeout(() => {
        setIsMounted(false);
        hideTimeoutRef.current = null;
        setTargetChapter(null);
      }, FADE_DURATION_MS);
    };

    window.addEventListener("showScrollIndicator", handleShow);
    window.addEventListener("hideScrollIndicator", handleHide);

    return () => {
      if (hideTimeoutRef.current !== null) {
        window.clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }
      window.removeEventListener("showScrollIndicator", handleShow);
      window.removeEventListener("hideScrollIndicator", handleHide);
    };
  }, []);

  if (!isMounted) {
    return null;
  }

  const handleClick = () => {
    if (targetChapter === null) {
      return;
    }

    const contentContainer = document.getElementById("content-container");
    if (!contentContainer) {
      return;
    }

    const chapterElement = contentContainer.querySelector(
      `section[data-chapter="${targetChapter}"]`,
    );
    if (!(chapterElement instanceof HTMLElement)) {
      return;
    }

    const containerRect = contentContainer.getBoundingClientRect();
    const chapterRect = chapterElement.getBoundingClientRect();
    const targetTop = chapterRect.top - containerRect.top + contentContainer.scrollTop;
    const adjustedTop = Math.max(0, targetTop - SCROLL_INDICATOR_SCROLL_MARGIN_PX);
    contentContainer.scrollTo({ top: adjustedTop, behavior: "smooth" });
    window.dispatchEvent(new Event("scrollIndicatorClicked"));
  };

  const MobileScrollIndicator = () => (
    <>
      <ChevronsUp className="w-[2.7rem] h-[2.7rem] pointer-events-none" />
      <span className="uppercase">{t("scroll_indicator-swipe-up")}</span>
    </>
  );

  const DesktopScrollIndicator = () => (
    <>
      <ChevronsDown className="w-[2.7rem] h-[2.7rem] pointer-events-none" />
      <span className="uppercase">{t("scroll_indicator-keep-scrolling")}</span>
    </>
  );

  return (
    <button
      type="button"
      className={`flex flex-col items-center fixed bottom-40 left-1/2 -translate-x-1/2 text-white cursor-pointer ${isMobileOrTablet ? "scroll-indicator-swipe-up" : "scroll-indicator-keep-scrolling"}`}
      aria-label={
        isMobileOrTablet ? t("scroll_indicator-swipe-up") : t("scroll_indicator-keep-scrolling")
      }
      onClick={handleClick}
    >
      {isMobileOrTablet ? <MobileScrollIndicator /> : <DesktopScrollIndicator />}
    </button>
  );
};
