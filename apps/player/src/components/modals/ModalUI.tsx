import React, { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { X } from "lucide-react";

import { cn } from "@player/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@player/components/ui/dialog";
import { useContentShift } from "@player/stores/contentShift.store";
import { useBookForm } from "@player/hooks/useBookForm";
import { useScreenSize } from "@player/hooks/useScreenSize";
import { useIsMobileOrTablet } from "@player/hooks/useIsMobileOrTablet";

const isTextInputElement = (element: Element | null): element is HTMLElement => {
  if (!element) return false;

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return true;
  }

  if (element instanceof HTMLElement) {
    return element.isContentEditable || element.getAttribute("role") === "textbox";
  }

  return false;
};

export interface ModalUIProps {
  title?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  layoutView?: boolean;
  hideOverlay?: boolean;
  transparent?: boolean;
  size?: "md" | "lg" | "xl" | "xxl" | "full";
  showCloseButton?: boolean;
  closeOnOverlayClick?: boolean;
  animateHeight?: boolean;
  headerActions?: ReactNode;
  searchActions?: ReactNode;
}

type ModalSize = { content: string; container: string };

const MODAL_SIZES: Record<NonNullable<ModalUIProps["size"]>, ModalSize> = {
  md: { content: "max-w-md", container: "w-full max-w-[100rem]" },
  lg: { content: "max-w-lg", container: "w-full max-w-[100rem]" },
  xl: { content: "max-w-2xl", container: "w-full max-w-[100rem]" },
  xxl: { content: "max-w-4xl", container: "w-full max-w-[100rem]" },
  full: { content: "w-full max-w-none", container: "w-full max-w-none" },
};

const LAYOUT_VIEW_SIZE: ModalSize = { content: "w-full h-full max-w-none pointer-events-none z-40", container: "w-full max-w-none pointer-events-none" };

const isTransparentModal = (transparent: boolean, className: string): boolean => {
  return transparent || className.includes("bg-transparent");
};

const getModalSizeConfig = (layoutView: boolean, size: NonNullable<ModalUIProps["size"]>): ModalSize => {
  return layoutView ? LAYOUT_VIEW_SIZE : MODAL_SIZES[size];
};

const getModalContentClasses = (
  isTransparent: boolean,
  layoutView: boolean,
  className: string,
  isContentShifted: boolean,
  isLargeScreen: boolean,
  isPlayFormat: boolean,
): string => {
  return cn(
    "rounded-lg overflow-hidden w-full flex flex-col items-center justify-center h-fit pointer-events-auto",
    !isTransparent && "bg-black/70 textured-bg border border-white/30 shadow-xl text-white",
    layoutView && [
      "overflow-hidden max-h-[70vh]",
      !isContentShifted && !isPlayFormat && "xl:flex-1 xl:max-w-[700px] xl:order-3",
      !isContentShifted && isPlayFormat && "w-full max-w-[800px]",
      isContentShifted && isLargeScreen && isPlayFormat && "max-w-[925px]",
    ],
    className,
  );
};

const getContainerClasses = (shouldShiftContent: boolean, layoutView: boolean, isPlayFormat: boolean, sizeConfig: ModalSize, isLargeScreen: boolean): string => {
  return cn(
    "flex flex-row justify-center h-full",
    sizeConfig.container,
    shouldShiftContent && layoutView && !isPlayFormat && "flex flex-row justify-center mx-auto max-w-[120rem] w-full xl:px-2",
    shouldShiftContent && layoutView && isPlayFormat && "flex flex-row mx-auto max-w-[120rem] w-full",
  );
};

const getModalWrapperClasses = (
  layoutView: boolean,
  isPlayFormat: boolean,
  isMediumScreen: boolean,
  isLargeScreen: boolean,
  shouldShiftContent: boolean,
  isWideScreen: boolean,
): string => {
  if (!layoutView) return "";

  if (!isPlayFormat) {
    // 2-COLUMN (medium): Modal on LEFT, overlaying the faded left-notes
    if (isMediumScreen && shouldShiftContent) {
      return "lg:flex-1 pointer-events-none flex items-center order-first max-w-[400px]";
    }
    // 3-COLUMN (large): Modal on RIGHT, fills the right-notes column
    if (isLargeScreen && shouldShiftContent) {
      return "pointer-events-none flex items-center";
    }
    // Default (no shift)
    return cn(
      !isMediumScreen && !isLargeScreen && "xl:flex-1 pointer-events-none max-w-[600px] flex items-center",
      (isMediumScreen || isLargeScreen) && "lg:flex-1 pointer-events-none max-w-[600px] flex items-center ml-2",
      isMediumScreen && "mr-2",
    );
  }

  // Play format positioning
  return cn(
    !isMediumScreen && !isLargeScreen && "pointer-events-none max-w-[800px] mx-auto flex items-center",
    isLargeScreen && shouldShiftContent && "xl:flex-1 max-w-[500px] pointer-events-none flex items-center mr-3",
    isMediumScreen && shouldShiftContent && "lg:flex-1 pointer-events-none max-w-[500px] flex items-center mr-2",
  );
};

interface SpacerProps {
  layoutView: boolean;
  isPlayFormat: boolean;
  isLargeScreen: boolean;
  isMediumScreen: boolean;
  shouldShiftContent: boolean;
  isMobileOrTablet: boolean;
  isWideScreen: boolean;
  columnWidths: { leftNotes: number; content: number; rightNotes: number };
}

const LeftSpacer: React.FC<SpacerProps> = ({ layoutView, isPlayFormat, isLargeScreen, isMediumScreen, shouldShiftContent, isMobileOrTablet, columnWidths }) => {
  if (!layoutView || isPlayFormat || isMobileOrTablet) return null;

  // 3-COLUMN (large) with shift: spacer matches actual left-notes column width
  if (isLargeScreen && shouldShiftContent && columnWidths.leftNotes > 0) {
    return <div style={{ flex: `0 0 ${columnWidths.leftNotes}px` }} />;
  }

  // Default spacers (when no shift)
  return (
    <>
      {isLargeScreen && <div className="hidden xl:block [flex:0_0_200px] mr-2" />}
      {isMediumScreen && <div className="hidden sm:block [flex:0_1_0%]" />}
    </>
  );
};

const ContentSpacer: React.FC<SpacerProps> = ({ layoutView, isPlayFormat, isMediumScreen, isLargeScreen, shouldShiftContent, isMobileOrTablet, columnWidths }) => {
  if (!layoutView) return null;

  // 3-COLUMN (large) with shift: spacer matches actual content column width
  if (isLargeScreen && shouldShiftContent && !isPlayFormat && columnWidths.content > 0) {
    return <div style={{ flex: `0 0 ${columnWidths.content}px` }} />;
  }

  if (!isPlayFormat) {
    return <div className={cn("modal-content max-w-[800px]", (isMediumScreen || isLargeScreen) && "sm:flex-3", !isMobileOrTablet && "xl:max-w-[850px] xxl:max-w-[900px]")} />;
  }

  return null;
};

const PlayFormatSpacer: React.FC<SpacerProps> = ({ layoutView, isPlayFormat, shouldShiftContent }) => {
  if (!layoutView || !isPlayFormat || !shouldShiftContent) return null;

  return <div className={cn("sm:flex-3 max-w-[800px] xl:max-w-[850px] xxl:max-w-[900px] xxl:w-[900px] xxl:flex-auto mx-2")} />;
};

interface ModalHeaderProps {
  title?: ReactNode;
  isTransparent: boolean;
  layoutView: boolean;
  showCloseButton: boolean;
  headerActions?: ReactNode;
  onClose: () => void;
}

const ModalHeader: React.FC<ModalHeaderProps> = ({ title, isTransparent, layoutView, showCloseButton, headerActions, onClose }) => {
  if (!title) return null;

  const titleClasses = cn("text-lg font-semibold", isTransparent ? "text-black" : "text-white");
  const closeButtonClasses = cn("p-1 rounded-md transition-colors cursor-pointer", isTransparent ? "text-gray-600 hover:text-black" : "text-white/70 hover:text-white");

  return (
    <header className={cn("flex justify-between items-center p-4 w-full", layoutView && "pb-0")}>
      <div className={titleClasses}>{title}</div>
      <div className="flex items-center gap-2">
        {headerActions}
        {showCloseButton && (
          <button
            type="button"
            onPointerUp={onClose}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClose();
              }
            }}
            className={closeButtonClasses}
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        )}
      </div>
    </header>
  );
};

const ModalUI: React.FC<ModalUIProps> = ({
  title,
  onClose,
  children,
  className = "",
  layoutView = false,
  hideOverlay = false,
  transparent = false,
  size = "lg",
  showCloseButton = true,
  closeOnOverlayClick = true,
  animateHeight = false,
  headerActions,
  searchActions,
}) => {
  const { isContentShiftedLeft } = useContentShift();
  const { isLargeScreen, isMediumScreen } = useScreenSize();
  const { isPlayFormat } = useBookForm();
  const isMobileOrTablet = useIsMobileOrTablet();

  // Track if screen is wide enough that modal fits in right column without squeezing
  const [isWideScreen, setIsWideScreen] = useState(() => typeof window !== "undefined" && window.innerWidth >= 1500);
  useEffect(() => {
    const checkWideScreen = () => setIsWideScreen(window.innerWidth >= 1500);
    window.addEventListener("resize", checkWideScreen);
    return () => window.removeEventListener("resize", checkWideScreen);
  }, []);

  // Measure actual column widths from the book layout
  const [columnWidths, setColumnWidths] = useState({ leftNotes: 0, content: 0, rightNotes: 0 });
  useEffect(() => {
    const measureColumns = () => {
      const leftNotes = document.getElementById("left-notes");
      const content = document.getElementById("content-container");
      const rightNotes = document.getElementById("right-notes");

      setColumnWidths({
        leftNotes: leftNotes?.getBoundingClientRect().width || 0,
        content: content?.getBoundingClientRect().width || 0,
        rightNotes: rightNotes?.getBoundingClientRect().width || 0,
      });
    };

    // Measure immediately for initial render
    measureColumns();

    // Re-measure after transitions complete (ContentShiftWrapper uses 0.3s transitions)
    const leftNotes = document.getElementById("left-notes");
    const handleTransitionEnd = (e: TransitionEvent) => {
      if (e.propertyName === "flex" || e.propertyName === "width") {
        measureColumns();
      }
    };
    leftNotes?.addEventListener("transitionend", handleTransitionEnd);

    window.addEventListener("resize", measureColumns);
    return () => {
      leftNotes?.removeEventListener("transitionend", handleTransitionEnd);
      window.removeEventListener("resize", measureColumns);
    };
  }, [isContentShiftedLeft, isLargeScreen, isMediumScreen, isWideScreen]);

  const isTransparent = isTransparentModal(transparent, className);
  const shouldShiftContent = isContentShiftedLeft && (isLargeScreen || isMediumScreen);
  const sizeConfig = getModalSizeConfig(layoutView, size);

  const modalContentClasses = getModalContentClasses(isTransparent, layoutView, className, isContentShiftedLeft, isLargeScreen, isPlayFormat);
  const containerClasses = getContainerClasses(shouldShiftContent, layoutView, isPlayFormat, sizeConfig, isLargeScreen);
  const modalWrapperClasses = getModalWrapperClasses(layoutView, isPlayFormat, isMediumScreen, isLargeScreen, shouldShiftContent, isWideScreen);

  const activeTextInputRef = useRef<HTMLElement | null>(null);
  const shouldTrapNextOutsideTapRef = useRef(false);
  const ignoreNextCloseRef = useRef(false);

  // Leave room for header buttons and input bar
  // Play format and mobile need more padding since modal is centered over content
  const bottomPadding = isPlayFormat || isMobileOrTablet ? 160 : 96;
  const maxHeight = `calc(var(--vvh, 100dvh) - ${bottomPadding}px)`;

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        if (ignoreNextCloseRef.current) {
          ignoreNextCloseRef.current = false;
          return;
        }

        onClose();
        return;
      }

      ignoreNextCloseRef.current = false;
    },
    [onClose],
  );

  const shouldKeepOpenOn = useCallback((target: EventTarget | null) => {
    if (!(target instanceof Element)) return false;

    return !!target.closest('[data-keep-modal-open="true"]');
  }, []);

  const handleOnInteractOutside = useCallback(
    (e: Event) => {
      const target = e.target as HTMLElement | null;

      if (shouldKeepOpenOn(target)) {
        e.preventDefault();
        return;
      }

      const activeElement = document.activeElement as HTMLElement | null;
      const focusedInput = isTextInputElement(activeElement) ? activeElement : activeTextInputRef.current;

      if (shouldTrapNextOutsideTapRef.current && isTextInputElement(focusedInput)) {
        shouldTrapNextOutsideTapRef.current = false;
        ignoreNextCloseRef.current = true;

        activeTextInputRef.current = null;

        focusedInput.blur();
        e.preventDefault();
        return;
      }

      if (closeOnOverlayClick === false) {
        e.preventDefault();
        return;
      }

      shouldTrapNextOutsideTapRef.current = false;
      activeTextInputRef.current = null;
      ignoreNextCloseRef.current = false;
      onClose();
    },
    [closeOnOverlayClick, shouldKeepOpenOn, onClose],
  );

  useEffect(() => {
    if (typeof document === "undefined") return;

    const updateTrackingForElement = (element: Element | null) => {
      if (isTextInputElement(element)) {
        activeTextInputRef.current = element;
        shouldTrapNextOutsideTapRef.current = true;
        ignoreNextCloseRef.current = false;
      } else {
        activeTextInputRef.current = null;
        shouldTrapNextOutsideTapRef.current = false;
        ignoreNextCloseRef.current = false;
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      updateTrackingForElement(event.target as HTMLElement | null);
    };

    const handleFocusOut = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;

      if (!isTextInputElement(target)) return;

      if (typeof window === "undefined") return;

      window.setTimeout(() => {
        if (activeTextInputRef.current === target) {
          updateTrackingForElement(null);
        }
      }, 0);
    };

    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);

    updateTrackingForElement(document.activeElement);

    return () => {
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
    };
  }, []);

  return (
    <Dialog open={true} onOpenChange={handleOpenChange} modal={!layoutView}>
      <DialogTitle className="sr-only">{typeof title === "string" ? title : "Modal"}</DialogTitle>

      <DialogContent
        aria-describedby={undefined}
        overlayProps={{ useCustomAnimation: true, hideOverlay }}
        className={cn("bg-transparent border-none shadow-none p-0", sizeConfig.content)}
        onInteractOutside={handleOnInteractOutside}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div className={containerClasses}>
          <LeftSpacer
            layoutView={layoutView}
            isPlayFormat={isPlayFormat}
            isLargeScreen={isLargeScreen}
            isMediumScreen={isMediumScreen}
            shouldShiftContent={shouldShiftContent}
            isMobileOrTablet={isMobileOrTablet}
            isWideScreen={isWideScreen}
            columnWidths={columnWidths}
          />
          <ContentSpacer
            layoutView={layoutView}
            isPlayFormat={isPlayFormat}
            isLargeScreen={isLargeScreen}
            isMediumScreen={isMediumScreen}
            shouldShiftContent={shouldShiftContent}
            isMobileOrTablet={isMobileOrTablet}
            isWideScreen={isWideScreen}
            columnWidths={columnWidths}
          />
          <PlayFormatSpacer
            layoutView={layoutView}
            isPlayFormat={isPlayFormat}
            shouldShiftContent={shouldShiftContent}
            isLargeScreen={isLargeScreen}
            isMediumScreen={isMediumScreen}
            isMobileOrTablet={isMobileOrTablet}
            isWideScreen={isWideScreen}
            columnWidths={columnWidths}
          />

          <div className={modalWrapperClasses} style={isLargeScreen && shouldShiftContent && columnWidths.rightNotes > 0 ? { width: columnWidths.rightNotes } : undefined}>
            <motion.div
              className={modalContentClasses}
              style={{ maxHeight }}
              layout={animateHeight}
              transition={animateHeight ? { duration: 0.3, ease: "easeInOut", layout: { duration: 0.3 } } : undefined}
            >
              <ModalHeader title={title} isTransparent={isTransparent} layoutView={layoutView} showCloseButton={showCloseButton} headerActions={headerActions} onClose={onClose} />

              {searchActions && <div className="w-full flex justify-between items-center px-4 pt-4">{searchActions}</div>}

              <motion.div
                className="py-3 px-2 overflow-y-auto opened-modal w-full"
                style={{ maxHeight: "inherit" }}
                layout={animateHeight}
                transition={animateHeight ? { duration: 0.3, ease: "easeInOut" } : undefined}
                onClick={(e) => {
                  if (e.target === e.currentTarget) {
                    onClose();
                  }
                }}
              >
                {children}
              </motion.div>
            </motion.div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ModalUI;
