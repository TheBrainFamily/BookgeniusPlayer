import React, { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";

interface ModalUIProps {
  title?: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  preventClickOutside?: boolean;
  layoutView?: boolean;
  hideOverlay?: boolean;
}

const ModalUI: React.FC<ModalUIProps> = ({ title, onClose, children, className = "", preventClickOutside = false, layoutView = false, hideOverlay = false }) => {
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogPortal>
        {!layoutView && (
          <DialogOverlay
            className={cn("bg-black/50 backdrop-blur-sm", hideOverlay && "bg-transparent backdrop-blur-none pointer-events-none")}
            onClick={preventClickOutside ? undefined : onClose}
          />
        )}
        <DialogTitle>{title}</DialogTitle>
        <DialogContent className={cn("bg-transparent border-none shadow-none p-0", layoutView ? "w-full max-w-none" : "max-w-lg")}>
          <div
            className={cn("flex flex-row gap-2 justify-center items-center mx-auto pl-2 pr-2 md:pr-0 xl:px-4 md:pl-4 h-full", layoutView ? "w-full max-w-none" : "max-w-[100rem]")}
          >
            {layoutView && <div id="left-notes-blank" className={cn("hidden max-w-[700px] ", "lg:flex lg:order-2 lg:flex-2 lg:max-w-[900px]", "xl:flex-1 xl:order-1")} />}
            <div
              className={cn(
                // Apply default styling only if className doesn't contain 'bg-transparent'
                !className.includes("bg-transparent") && "bg-black/70 textured-bg border border-white/30 shadow-xl text-white",
                // Always apply these base classes
                "rounded-lg overflow-hidden w-full flex flex-col align-center justify-center h-fit pointer-events-auto",
                // Layout view specific styling
                layoutView && "max-w-[700px] overflow-hidden max-h-[80vh]",
                layoutView && "lg:order-1 lg:max-w-[700px] lg:flex-1",
                layoutView && "xl:flex-1 xl:max-w-[700px] xl:order-3",
                // Allow custom className overrides
                className,
              )}
              onClick={(e) => e.stopPropagation()}
            >
              {title && (
                <div className="flex justify-between items-center p-4">
                  {title && <h3 className={cn("text-lg font-semibold", !className.includes("bg-transparent") ? "text-white" : "text-black")}>{title}</h3>}
                  {!title && <div />}
                  <button
                    onClick={onClose}
                    className={cn(
                      "p-1 rounded-md transition-colors cursor-pointer",
                      !className.includes("bg-transparent") ? "text-white/70 hover:text-white" : "text-gray-600 hover:text-black",
                    )}
                    aria-label="Zamknij modal"
                  >
                    <X size={20} />
                  </button>
                </div>
              )}
              <div className="p-4 overflow-y-auto">{children}</div>
            </div>
            {layoutView && <div id="right-notes-blank" className={cn("hidden max-w-[900px]", "xl:block xl:flex-2 xl:order-2")} />}
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
};

export default ModalUI;
