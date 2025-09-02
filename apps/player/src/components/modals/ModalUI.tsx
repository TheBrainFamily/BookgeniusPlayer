import React, { ReactNode, useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
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
      "overflow-hidden max-h-[80vh]",
      // On large screens with content shifted, use narrower width; otherwise use full width
      isLargeScreen && isContentShifted ? "w-[30vw]" : "max-w-[700px]",
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
  animateHeight = false,
}) => {
  const { isContentShiftedLeft } = useContentShift();
  const [isLargeScreen, setIsLargeScreen] = useState(false);

  useEffect(() => {
    const checkScreenSize = () => {
      setIsLargeScreen(window.innerWidth >= 1280);
    };

    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open && !layoutView) {
        onClose();
      }
    },
    [onClose, layoutView],
  );

  const isTransparent = isTransparentModal(transparent, className);
  const sizeConfig = getModalSizeConfig(layoutView, size);
  const modalContentClasses = getModalContentClasses(isTransparent, layoutView, className, isContentShiftedLeft, isLargeScreen);
  const titleTextClasses = getTitleClasses(isTransparent);
  const closeButtonClasses = getCloseButtonClasses(isTransparent);

  // Only shift content on large screens
  const shouldShiftContent = isContentShiftedLeft && isLargeScreen;

  return (
    <Dialog open={true} onOpenChange={handleOpenChange} modal={!layoutView}>
      {/* Overlay with AnimatePresence */}
      <AnimatePresence>
        {!hideOverlay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          />
        )}
      </AnimatePresence>

      {/* Accessibility */}
      {title ? <DialogTitle className="sr-only">{typeof title === "string" ? title : "Modal"}</DialogTitle> : <DialogTitle className="sr-only">Modal</DialogTitle>}

      {/* Modal Content */}
      <DialogContent className={cn("bg-transparent border-none shadow-none p-0", sizeConfig.content)}>
        <div
          className={cn(
            "flex flex-row gap-2 items-center p-2 xl:px-4 h-full",
            sizeConfig.container,
            // Position modal in the right space when content is shifted left on large screens
            shouldShiftContent && layoutView ? "justify-end pr-[3%] ml-auto mr-0" : "justify-center mx-auto",
          )}
        >
          {layoutView && !shouldShiftContent && <div id="left-notes-blank" className="hidden max-w-[700px] pointer-events-none xl:flex xl:flex-1 xl:order-1" />}

          <motion.div
            className={modalContentClasses}
            onClick={(e) => e.stopPropagation()}
            layout={animateHeight}
            transition={animateHeight ? { duration: 0.3, ease: "easeInOut", layout: { duration: 0.3 } } : undefined}
          >
            {title && (
              <header className="flex justify-between items-center p-4">
                <div className={titleTextClasses}>{title}</div>
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
              </header>
            )}

            <motion.main
              className="p-4 overflow-y-auto opened-modal scrollbar-search"
              layout={animateHeight}
              transition={animateHeight ? { duration: 0.3, ease: "easeInOut" } : undefined}
            >
              {children}
            </motion.main>
          </motion.div>

          {layoutView && !shouldShiftContent && <div id="right-notes-blank" className="hidden xl:block xl:flex-2 xl:order-2" />}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ModalUI;
