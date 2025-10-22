import React, { ReactNode, useCallback } from "react";
import { motion } from "motion/react";
import { X } from "lucide-react";

import { cn } from "@player/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@player/components/ui/dialog";
import { useContentShift } from "@player/stores/contentShift.store";
import { useBookForm } from "@player/hooks/useBookForm";
import { useScreenSize } from "@player/hooks/useScreenSize";

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

const LAYOUT_VIEW_SIZE: ModalSize = { content: "w-full h-full max-w-none pointer-events-none z-50", container: "w-full max-w-none pointer-events-none" };

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
    "rounded-lg overflow-hidden w-full flex flex-col align-center justify-center h-fit pointer-events-auto",
    !isTransparent && "bg-black/70 textured-bg border border-white/30 shadow-xl text-white",
    layoutView && [
      "overflow-hidden max-h-[70vh]",
      !isContentShifted && !isPlayFormat && "xl:flex-1 xl:max-w-[700px] xl:order-3",
      !isContentShifted && isPlayFormat && "w-full max-w-[800px]",
    ],
    className,
  );
};

const getContainerClasses = (shouldShiftContent: boolean, layoutView: boolean, isPlayFormat: boolean, sizeConfig: ModalSize): string => {
  return cn(
    "flex flex-row gap-2 justify-center h-full",
    sizeConfig.container,
    shouldShiftContent && layoutView && !isPlayFormat && "flex flex-row gap-0 sm:gap-2 justify-center mx-auto px-0 max-w-[120rem] w-full",
    shouldShiftContent && layoutView && isPlayFormat && "flex flex-row gap-2 mx-auto px-2 max-w-[120rem] w-full",
  );
};

const getModalWrapperClasses = (layoutView: boolean, isPlayFormat: boolean, isMediumScreen: boolean, isLargeScreen: boolean, shouldShiftContent: boolean): string => {
  if (!layoutView) return "";

  if (!isPlayFormat) {
    return cn(
      !isMediumScreen && !isLargeScreen && "xl:flex-1 pointer-events-none max-w-[600px] flex items-center",
      (isMediumScreen || isLargeScreen) && "lg:flex-1 pointer-events-none max-w-[600px] flex items-center pr-2",
    );
  }

  return cn(
    !isMediumScreen && !isLargeScreen && "pointer-events-none max-w-[800px] mx-auto",
    isLargeScreen && shouldShiftContent && "xl:flex-1 pointer-events-none max-w-[600px] flex items-center",
    isMediumScreen && shouldShiftContent && "lg:flex-1 pointer-events-none max-w-[600px] flex items-center",
  );
};

interface SpacerProps {
  layoutView: boolean;
  isPlayFormat: boolean;
  isLargeScreen: boolean;
  isMediumScreen: boolean;
  shouldShiftContent: boolean;
}

const LeftSpacer: React.FC<SpacerProps> = ({ layoutView, isPlayFormat, isLargeScreen, isMediumScreen }) => {
  if (!layoutView || isPlayFormat) return null;

  return (
    <>
      {isLargeScreen && <div id="left-notes-blank" className="hidden xl:block [flex:0_0_200px]" />}
      {isMediumScreen && <div id="left-notes-blank" className="hidden sm:block [flex:0_1_0%]" />}
    </>
  );
};

const ContentSpacer: React.FC<SpacerProps> = ({ layoutView, isPlayFormat, isMediumScreen, isLargeScreen }) => {
  if (!layoutView) return null;

  if (!isPlayFormat) {
    return <div className={cn("max-w-[900px] xl:max-w-[800px] xxl:max-w-[900px]", (isMediumScreen || isLargeScreen) && "sm:flex-3")} />;
  }

  return null;
};

const PlayFormatSpacer: React.FC<SpacerProps> = ({ layoutView, isPlayFormat, shouldShiftContent }) => {
  if (!layoutView || !isPlayFormat || !shouldShiftContent) return null;

  return <div className="sm:flex-3 max-w-[900px] xl:max-w-[800px] xxl:max-w-[900px] xxl:w-[900px] xxl:flex-auto" />;
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
    <header className={cn("flex justify-between items-center p-4", layoutView && "pb-0")}>
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

  const isTransparent = isTransparentModal(transparent, className);
  const shouldShiftContent = isContentShiftedLeft && (isLargeScreen || isMediumScreen);
  const sizeConfig = getModalSizeConfig(layoutView, size);

  const modalContentClasses = getModalContentClasses(isTransparent, layoutView, className, isContentShiftedLeft, isLargeScreen, isPlayFormat);
  const containerClasses = getContainerClasses(shouldShiftContent, layoutView, isPlayFormat, sizeConfig);
  const modalWrapperClasses = getModalWrapperClasses(layoutView, isPlayFormat, isMediumScreen, isLargeScreen, shouldShiftContent);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) onClose();
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
      if (closeOnOverlayClick === false || shouldKeepOpenOn(target)) {
        e.preventDefault();
        return;
      }
      onClose();
    },
    [closeOnOverlayClick, shouldKeepOpenOn, onClose],
  );

  const maxHeight = `calc(var(--vvh, 100dvh) - ${!isMediumScreen || !isLargeScreen ? 96 : 32}px)`;

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
          <LeftSpacer layoutView={layoutView} isPlayFormat={isPlayFormat} isLargeScreen={isLargeScreen} isMediumScreen={isMediumScreen} shouldShiftContent={shouldShiftContent} />
          <ContentSpacer
            layoutView={layoutView}
            isPlayFormat={isPlayFormat}
            isLargeScreen={isLargeScreen}
            isMediumScreen={isMediumScreen}
            shouldShiftContent={shouldShiftContent}
          />
          <PlayFormatSpacer
            layoutView={layoutView}
            isPlayFormat={isPlayFormat}
            shouldShiftContent={shouldShiftContent}
            isLargeScreen={isLargeScreen}
            isMediumScreen={isMediumScreen}
          />

          <div className={modalWrapperClasses}>
            <motion.div
              className={modalContentClasses}
              style={{ maxHeight }}
              layout={animateHeight}
              transition={animateHeight ? { duration: 0.3, ease: "easeInOut", layout: { duration: 0.3 } } : undefined}
            >
              <ModalHeader title={title} isTransparent={isTransparent} layoutView={layoutView} showCloseButton={showCloseButton} headerActions={headerActions} onClose={onClose} />

              {searchActions && <div className="flex justify-between items-center px-4 pt-4">{searchActions}</div>}

              <motion.div
                className="py-3 px-2 overflow-y-auto opened-modal"
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
