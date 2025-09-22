import React, { ReactNode, useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { X } from "lucide-react";

import { cn } from "@player/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@player/components/ui/dialog";
import { useContentShift } from "@player/stores/contentShift.store";

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
}

type ModalSize = { content: string; container: string };

const MODAL_SIZES: Record<NonNullable<ModalUIProps["size"]>, ModalSize> = {
  md: { content: "max-w-md", container: "w-full max-w-[100rem]" },
  lg: { content: "max-w-lg", container: "w-full max-w-[100rem]" },
  xl: { content: "max-w-2xl", container: "w-full max-w-[100rem]" },
  xxl: { content: "max-w-4xl", container: "w-full max-w-[100rem]" },
  full: { content: "w-full max-w-none", container: "w-full max-w-none" },
};

const LAYOUT_VIEW_SIZE: ModalSize = { content: "w-full max-w-none pointer-events-none z-50", container: "w-full max-w-none pointer-events-none" };

const isTransparentModal = (transparent: boolean, className: string): boolean => {
  return transparent || className.includes("bg-transparent");
};

const getModalSizeConfig = (layoutView: boolean, size: NonNullable<ModalUIProps["size"]>): ModalSize => {
  return layoutView ? LAYOUT_VIEW_SIZE : MODAL_SIZES[size];
};

const getModalContentClasses = (isTransparent: boolean, layoutView: boolean, className: string, isContentShifted: boolean, isLargeScreen: boolean): string => {
  return cn(
    // Base classes
    "rounded-lg overflow-hidden w-full flex flex-col align-center justify-center h-fit pointer-events-auto",

    // Default styling (unless transparent)
    !isTransparent && "bg-black/70 textured-bg border border-white/30 shadow-xl text-white",

    // Layout view specific styling
    layoutView && [
      "overflow-hidden max-h-[70vh]",
      // On large screens with content shifted, use narrower width; otherwise use full width
      isLargeScreen && isContentShifted ? "w-[26vw]" : "max-w-[700px]",
      // Only apply flex layout on large screens without content shift
      !isContentShifted && "xl:flex-1 xl:max-w-[700px] xl:order-3",
    ],

    // Custom className overrides
    className,
  );
};

const getTitleClasses = (isTransparent: boolean): string => {
  return cn("text-lg font-semibold", isTransparent ? "text-black" : "text-white");
};

const getCloseButtonClasses = (isTransparent: boolean): string => {
  return cn("p-1 rounded-md transition-colors cursor-pointer", isTransparent ? "text-gray-600 hover:text-black" : "text-white/70 hover:text-white");
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
}) => {
  const [isLargeScreen, setIsLargeScreen] = useState(false);
  const [justOpened, setJustOpened] = useState(true);

  const { isContentShiftedLeft } = useContentShift();
  const isTransparent = isTransparentModal(transparent, className);
  const sizeConfig = getModalSizeConfig(layoutView, size);
  const modalContentClasses = getModalContentClasses(isTransparent, layoutView, className, isContentShiftedLeft, isLargeScreen);
  const titleTextClasses = getTitleClasses(isTransparent);
  const closeButtonClasses = getCloseButtonClasses(isTransparent);

  // Only shift content on large screens
  const shouldShiftContent = isContentShiftedLeft && isLargeScreen;

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open && !justOpened) onClose();
    },
    [onClose, justOpened],
  );

  const shouldKeepOpenOn = useCallback((target: EventTarget | null) => {
    if (!(target instanceof Element)) return false;

    return !!target.closest('[data-keep-modal-open="true"]');
  }, []);

  const handleOnInteractOutside = useCallback(
    (e: Event) => {
      const target = e.target as HTMLElement | null;

      if (closeOnOverlayClick === false) {
        e.preventDefault();
        return;
      }

      if (shouldKeepOpenOn(target)) {
        e.preventDefault();
      }
    },
    [closeOnOverlayClick, shouldKeepOpenOn],
  );

  useEffect(() => {
    const checkScreenSize = () => {
      setIsLargeScreen(window.innerWidth >= 1280);
    };

    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  // Reset justOpened flag after a short delay to prevent immediate closing
  useEffect(() => {
    const timer = setTimeout(() => {
      setJustOpened(false);
    }, 100); // Small delay to allow modal to fully open

    return () => clearTimeout(timer);
  }, []);

  return (
    <Dialog open={true} onOpenChange={handleOpenChange} modal={!layoutView}>
      {/* Accessibility */}
      {title ? <DialogTitle className="sr-only">{typeof title === "string" ? title : "Modal"}</DialogTitle> : <DialogTitle className="sr-only">Modal</DialogTitle>}

      {/* Modal Content */}
      <DialogContent
        aria-describedby={undefined}
        overlayProps={{ useCustomAnimation: true, hideOverlay }}
        className={cn("bg-transparent border-none shadow-none p-0", sizeConfig.content)}
        onInteractOutside={handleOnInteractOutside}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div
          className={cn(
            "flex flex-row gap-2 items-center h-full",
            sizeConfig.container,
            // Position modal in the right space when content is shifted left on large screens
            shouldShiftContent && layoutView ? "justify-end pr-[3%] ml-auto mr-0" : "justify-center mx-auto",
          )}
        >
          {layoutView && !shouldShiftContent && <div id="left-notes-blank" className="hidden max-w-[700px] pointer-events-none xl:flex xl:flex-1 xl:order-1" />}

          <motion.div
            className={modalContentClasses}
            layout={animateHeight}
            transition={animateHeight ? { duration: 0.3, ease: "easeInOut", layout: { duration: 0.3 } } : undefined}
          >
            {title && (
              <header className="flex justify-between items-center p-4">
                <div className={titleTextClasses}>{title}</div>
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
            )}

            <motion.div
              className="p-4 overflow-y-auto opened-modal"
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

          {layoutView && !shouldShiftContent && <div id="right-notes-blank" className="hidden xl:block xl:flex-2 xl:order-2" />}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ModalUI;
