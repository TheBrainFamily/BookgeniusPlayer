"use client";

import * as React from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { cn } from "@player/lib/utils";

type SAProps = React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> & {
  orientation?: "vertical" | "horizontal";
  viewportClassName?: string;
  wheelToHorizontal?: boolean;
  hideScrollbar?: boolean;
};

const ScrollArea = React.forwardRef<React.ElementRef<typeof ScrollAreaPrimitive.Root>, SAProps>(
  ({ className, children, orientation = "vertical", viewportClassName, wheelToHorizontal = false, hideScrollbar = true, ...props }, ref) => {
    const viewportRef = React.useRef<HTMLDivElement | null>(null);

    React.useEffect(() => {
      const el = viewportRef.current;
      if (!el || !wheelToHorizontal || orientation !== "horizontal") return;

      const onWheel = (e: WheelEvent) => {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          el.scrollLeft += e.deltaY;
          e.preventDefault();
        }
      };

      el.addEventListener("wheel", onWheel, { passive: false });
      return () => el.removeEventListener("wheel", onWheel);
    }, [wheelToHorizontal, orientation]);

    return (
      <ScrollAreaPrimitive.Root ref={ref} className={cn("relative overflow-hidden group/sa", className)} {...props}>
        <ScrollAreaPrimitive.Viewport
          ref={viewportRef}
          className={cn(
            "h-full w-full rounded-[inherit] scroll-smooth",
            orientation === "horizontal" ? "overflow-x-auto overflow-y-hidden" : "overflow-y-auto overflow-x-hidden",
            orientation === "horizontal" && "snap-x snap-mandatory",
            viewportClassName,
          )}
        >
          {children}
        </ScrollAreaPrimitive.Viewport>

        {orientation === "horizontal" ? (
          <ScrollBar orientation="horizontal" className={cn(hideScrollbar && "opacity-0 group-hover/sa:opacity-100", "transition-opacity duration-200")} />
        ) : (
          <ScrollBar orientation="vertical" className={cn(hideScrollbar && "opacity-0 group-hover/sa:opacity-100", "transition-opacity duration-200")} />
        )}

        <ScrollAreaPrimitive.Corner />
      </ScrollAreaPrimitive.Root>
    );
  },
);
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = "vertical", ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      "flex touch-none select-none",
      orientation === "vertical" && "h-full w-1.5 border-l border-l-transparent p-[1px]",
      orientation === "horizontal" && "h-1.5 flex-col border-t border-t-transparent p-[1px]",
      "transition-[background,opacity]",
      className,
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border/40 hover:bg-border/60" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
));
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;

export { ScrollArea, ScrollBar };
