import React, { ReactNode, useCallback } from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle, DialogOverlay } from "@/components/ui/dialog";

export interface ModalUIProps {
  title?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  layoutView?: boolean;
  hideOverlay?: boolean;
  transparent?: boolean;
  size?: "sm" | "md" | "lg" | "full";
  showCloseButton?: boolean;
  closeOnOverlayClick?: boolean;
}

type ModalSize = { content: string; container: string };

const MODAL_SIZES: Record<NonNullable<ModalUIProps["size"]>, ModalSize> = {
  sm: { content: "max-w-md", container: "max-w-[100rem]" },
  md: { content: "max-w-lg", container: "max-w-[100rem]" },
  lg: { content: "max-w-2xl", container: "max-w-[100rem]" },
  full: { content: "w-full max-w-none", container: "w-full max-w-none" },
};

const LAYOUT_VIEW_SIZE: ModalSize = { content: "w-full max-w-none pointer-events-none z-49", container: "w-full max-w-none pointer-events-none" };

const isTransparentModal = (transparent: boolean, className: string): boolean => {
  return transparent || className.includes("bg-transparent");
};

const getModalSizeConfig = (layoutView: boolean, size: NonNullable<ModalUIProps["size"]>): ModalSize => {
  return layoutView ? LAYOUT_VIEW_SIZE : MODAL_SIZES[size];
};

const getModalContentClasses = (isTransparent: boolean, layoutView: boolean, className: string): string => {
  return cn(
    // Base classes
    "rounded-lg overflow-hidden w-full flex flex-col align-center justify-center h-fit pointer-events-auto",

    // Default styling (unless transparent)
    !isTransparent && "bg-black/70 textured-bg border border-white/30 shadow-xl text-white",

    // Layout view specific styling
    layoutView && ["max-w-[700px] overflow-hidden max-h-[80vh]", "lg:order-1 lg:max-w-[700px] lg:flex-1", "xl:flex-1 xl:max-w-[700px] xl:order-3"],

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
  size = "md",
  showCloseButton = true,
}) => {
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
  const modalContentClasses = getModalContentClasses(isTransparent, layoutView, className);
  const titleTextClasses = getTitleClasses(isTransparent);
  const closeButtonClasses = getCloseButtonClasses(isTransparent);

  return (
    <Dialog open={true} onOpenChange={handleOpenChange} modal={!layoutView}>
      {/* Overlay */}
      <DialogOverlay className={cn("dialog-overlay", hideOverlay && "bg-transparent backdrop-blur-none")} />

      {/* Accessibility */}
      {title && <DialogTitle className="sr-only">{typeof title === "string" ? title : "Modal"}</DialogTitle>}

      {/* Modal Content */}
      <DialogContent className={cn("bg-transparent border-none shadow-none p-0", sizeConfig.content)} onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className={cn("flex flex-row gap-2 justify-center items-center mx-auto pl-2 pr-2 md:pr-0 xl:px-4 md:pl-4 h-full", sizeConfig.container)}>
          {layoutView && <div id="left-notes-blank" className="hidden max-w-[700px] pointer-events-none lg:flex lg:order-2 lg:flex-2 lg:max-w-[900px] xl:flex-1 xl:order-1" />}

          <div className={modalContentClasses} onClick={(e) => e.stopPropagation()}>
            {title && (
              <header className="flex justify-between items-center p-4">
                <div className={titleTextClasses}>{title}</div>
                {showCloseButton && (
                  <button type="button" onClick={onClose} className={closeButtonClasses} aria-label="Close modal">
                    <X size={20} />
                  </button>
                )}
              </header>
            )}

            <main className="p-4 overflow-y-auto">{children}</main>
          </div>

          {layoutView && <div id="right-notes-blank" className="hidden max-w-[900px] xl:block xl:flex-2 xl:order-2" />}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ModalUI;
