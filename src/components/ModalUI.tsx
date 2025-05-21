import React, { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalUIProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: "sm" | "md" | "lg" | "xl" | "full";
  height?: "auto" | "sm" | "md" | "lg" | "xl" | "full";
  className?: string;
  preventClickOutside?: boolean;
  layoutView?: boolean;
  hideOverlay?: boolean;
}

const ModalUI: React.FC<ModalUIProps> = ({
  title,
  onClose,
  children,
  width = "md",
  height = "md",
  className = "",
  preventClickOutside = false,
  layoutView = false,
  hideOverlay = false,
}) => {
  // Width classes based on size prop
  const widthClasses = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-lg", xl: "max-w-xl", full: "max-w-full" };

  // Height classes based on size prop
  const heightClasses = { auto: "h-auto", sm: "max-h-[50vh]", md: "max-h-[70vh]", lg: "max-h-[85vh]", xl: "max-h-[95vh]", full: "h-screen" };

  return (
    <div className={cn("fixed inset-0 flex items-center justify-center", hideOverlay ? "pointer-events-none" : "bg-black/50")} onClick={preventClickOutside ? undefined : onClose}>
      <div className="flex flex-row gap-2 justify-center mx-auto pl-2 pr-2 md:pr-0 xl:px-4 md:pl-4 max-w-[150rem] w-full h-full">
        {layoutView && <div id="left-notes-blank" className={cn("pointer-events-none hidden md:block md:flex-1 max-w-[700px] xl:order-1", "lg:order-2 lg:flex-2 ")} />}
        <div
          className={cn(
            `bg-white dark:bg-gray-800 rounded-lg overflow-hidden ${widthClasses[width]} ${heightClasses[height]} w-full flex flex-col shadow-xl ${className} pointer-events-all`,
            "xl:flex-1 xl:max-w-[700px] xl:order-3",
            "lg:order-1 lg:max-w-[700px] lg:flex-1",
          )}
          onClick={(e) => e.stopPropagation()}
        >
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
          <div className="p-4 overflow-y-auto flex-grow">{children}</div>
        </div>
        {layoutView && <div id="right-notes-blank" className={cn("pointer-events-none hidden xl:block xl:flex-2 max-w-[900px] xl:order-2", "")} />}
      </div>
    </div>
  );
};

export default ModalUI;
