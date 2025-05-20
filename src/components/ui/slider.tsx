import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const sliderVariants = cva("relative flex w-full touch-none select-none items-center", {
  variants: { variant: { primary: "", secondary: "" } },
  defaultVariants: { variant: "primary" },
});

export interface SliderProps extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>, VariantProps<typeof sliderVariants> {}

const Slider = React.forwardRef<React.ElementRef<typeof SliderPrimitive.Root>, SliderProps>(({ className, variant = "primary", ...props }, ref) => (
  <SliderPrimitive.Root ref={ref} className={cn(sliderVariants({ variant, className }))} {...props}>
    <SliderPrimitive.Track className={cn("relative h-1.5 w-full grow overflow-hidden rounded-full", variant === "secondary" ? "bg-secondary/20" : "bg-primary/20")}>
      <SliderPrimitive.Range className={cn("absolute h-full", variant === "secondary" ? "bg-secondary" : "bg-primary")} />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb
      className={cn(
        "block h-4 w-4 rounded-full border shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
        variant === "secondary" ? "border-secondary/50 bg-secondary" : "border-primary/50 bg-primary",
      )}
    />
  </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider, sliderVariants };
