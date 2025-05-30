import React, { useEffect, useState } from "react";
import { AnimatePresence, motion, Variants } from "motion/react";
import { UndoDot } from "lucide-react";

import { shouldShowReturnButton, systemNavigateTo, getSavedLocation } from "@/helpers/paragraphsNavigation";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLocation } from "@/state/LocationContext";

const ReturnToLocationButton = () => {
  const [isVisible, setIsVisible] = useState(false);
  const { location } = useLocation();

  useEffect(() => {
    setIsVisible(shouldShowReturnButton());
  }, [location.currentParagraph, location.currentChapter]);

  const onGoBackClick = () => {
    const savedLocation = getSavedLocation();
    systemNavigateTo({ currentChapter: savedLocation.currentChapter, currentParagraph: savedLocation.currentParagraph });
    setIsVisible(false);
  };

  return (
    <AnimatePresence mode="wait" initial={false}>
      {isVisible && (
        <div className="bg-black/70 textured-bg rounded-3xl border shadow-xl text-white border-white/30 px-1 flex items-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <motion.button
                onClick={onGoBackClick}
                className="p-2 my-1 text-sm hover:text-white rounded-full cursor-pointer flex flex-row gap-2 items-center h-9 font-medium"
                whileHover="hover"
                whileTap="tap"
                initial="hidden"
                animate="visible"
                exit={"hidden"}
                variants={buttonVariants}
              >
                <UndoDot className="w-4 h-4" />
                Wróć
              </motion.button>
            </TooltipTrigger>
            <TooltipContent>Powrót do ostatniego miejsca czytania</TooltipContent>
          </Tooltip>
        </div>
      )}
    </AnimatePresence>
  );
};

const buttonVariants: Variants = {
  hidden: { opacity: 0, transition: { duration: 1 } },
  visible: { opacity: 1, transition: { duration: 1 } },
  hover: { backgroundColor: "rgba(255,255,255,0.2)", boxShadow: "0px 0px 8px rgba(255,255,255,0.5)" },
  tap: { scale: 0.9 },
};

export default ReturnToLocationButton;
