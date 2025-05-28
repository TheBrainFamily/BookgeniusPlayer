import React, { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalUIOldProps {
  title?: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  preventClickOutside?: boolean;
  layoutView?: boolean;
  hideOverlay?: boolean;
}

const ModalUIOld: React.FC<ModalUIOldProps> = ({ title, onClose, children, className = "", preventClickOutside = false, layoutView = false, hideOverlay = false }) => {
  return (
    <div
      className={cn("fixed inset-0 flex items-center justify-center self-center z-999", hideOverlay ? "pointer-events-none" : "bg-black/50 h-full w-full")}
      onClick={preventClickOutside ? undefined : onClose}
    >
      <div className={cn("flex flex-row gap-2 justify-center items-center mx-auto pl-2 pr-2 md:pr-0 xl:px-4 md:pl-4 max-w-[150rem] h-full", layoutView && "w-full")}>
        {layoutView && <div id="left-notes-blank" className={cn("hidden max-w-[700px] ", "lg:flex lg:order-2 lg:flex-2 lg:max-w-[900px]", "xl:flex-1 xl:order-1")} />}
        <div
          className={cn(
            `bg-white rounded-lg overflow-hidden w-full flex flex-col align-center justify-center h-fit pointer-events-auto ${className}`,
            layoutView && "shadow-xl max-w-[700px] overflow-hidden max-h-[80vh]",
            layoutView && "lg:order-1 lg:max-w-[700px] lg:flex-1",
            layoutView && "xl:flex-1 xl:max-w-[700px] xl:order-3",
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {title && (
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="text-lg font-semibold">{title}</h3>
              <button
                onClick={onClose}
                className="p-1 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                aria-label="Close modal"
              >
                <X size={20} />
              </button>
            </div>
          )}
          <div className="p-4 overflow-y-auto">{children}</div>
        </div>
        {layoutView && <div id="right-notes-blank" className={cn("hidden max-w-[900px]", "xl:block xl:flex-2 xl:order-2")} />}
      </div>
    </div>
  );
};

export default ModalUIOld;
