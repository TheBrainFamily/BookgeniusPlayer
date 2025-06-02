import React, { useEffect, useState } from "react";
import { AnimatePresence, motion, Variants } from "motion/react";
import { UndoDot } from "lucide-react";

import { shouldShowReturnButton, systemNavigateTo, getSavedLocation } from "@/helpers/paragraphsNavigation";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLocationRange } from "@/hooks/useLocationRange";
import { cn } from "@/lib/utils";

const ReturnToLocationButton = () => {
  const [isVisible, setIsVisible] = useState(false);
  const {
    locationRange: { currentChapter, currentParagraph },
  } = useLocationRange(300);

  useEffect(() => {
    setIsVisible(shouldShowReturnButton());
  }, [currentParagraph, currentChapter]);

  useEffect(() => {
    const handleFurthestLocationReset = () => {
      setIsVisible(false);
    };

    window.addEventListener("furthestLocationReset", handleFurthestLocationReset);
    return () => {
      window.removeEventListener("furthestLocationReset", handleFurthestLocationReset);
    };
  }, []);

  const onGoBackClick = () => {
    const savedLocation = getSavedLocation();
    systemNavigateTo({ currentChapter: savedLocation.currentChapter, currentParagraph: savedLocation.currentParagraph });
    setIsVisible(false);
  };
  console.log("go back button visible", isVisible);

  return (
    <AnimatePresence>
      <motion.div className="optional-element">
        {isVisible && (
          <motion.div
            className={cn("bg-black/70 textured-bg rounded-3xl border shadow-xl text-white border-white/30 px-1 flex items-center", "optional-element")}
            initial="hidden"
            animate="visible"
            exit="hidden"
            variants={variants.container}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <motion.button
                  onClick={onGoBackClick}
                  className="p-2 my-1 text-sm hover:text-white rounded-full cursor-pointer flex flex-row gap-2 items-center h-8 font-medium"
                  whileHover="hover"
                  whileTap="tap"
                  initial="hidden"
                  animate="visible"
                  exit={"hidden"}
                  variants={variants.button}
                >
                  <UndoDot className="w-4 h-4" />
                  Wróć
                </motion.button>
              </TooltipTrigger>
              <TooltipContent>Powrót do ostatniego miejsca czytania</TooltipContent>
            </Tooltip>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

const variants: Record<string, Variants> = {
  container: { hidden: { opacity: 0, scale: 0.8, transition: { duration: 0.5 } }, visible: { opacity: 1, scale: 1, transition: { duration: 0.2 } } },
  button: {
    hidden: { opacity: 0, transition: { duration: 1 } },
    visible: { opacity: 1, transition: { duration: 1 } },
    hover: { backgroundColor: "rgba(255,255,255,0.2)", boxShadow: "0px 0px 8px rgba(255,255,255,0.5)" },
    tap: { scale: 0.9 },
  },
};

export default ReturnToLocationButton;
