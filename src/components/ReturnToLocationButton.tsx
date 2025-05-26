import React, { useEffect, useState } from "react";
import { motion, Variants } from "motion/react";
import { UndoDot } from "lucide-react";
import { shouldShowReturnButton, goToParagraph, getSavedLocation } from "@/helpers/paragraphsNavigation";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const ReturnToLocationButton = () => {
  const [isVisible, setIsVisible] = useState(false);

  // ToDo: Check visibility whenever location changes
  useEffect(() => {
    const checkVisibility = () => {
      setIsVisible(shouldShowReturnButton());
    };

    checkVisibility();

    const intervalId = setInterval(checkVisibility, 1000);

    return () => clearInterval(intervalId);
  }, []);

  const onGoBackClick = () => {
    goToParagraph(getSavedLocation());
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="bg-black/40 backdrop-blur-md rounded-3xl border shadow-xl text-white border-white/30 px-1 flex items-center">
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.button
            onClick={onGoBackClick}
            className="p-2 my-1 hover:text-white rounded-full cursor-pointer flex flex-row gap-2 items-center h-9"
            whileHover="hover"
            whileTap="tap"
            variants={buttonVariants}
          >
            <UndoDot className="w-4 h-4" />
            Wróć
          </motion.button>
        </TooltipTrigger>
        <TooltipContent>Powrót do ostatniego miejsca czytania</TooltipContent>
      </Tooltip>
    </div>
  );
};

const buttonVariants: Variants = { initial: {}, hover: { backgroundColor: "rgba(255,255,255,0.2)", boxShadow: "0px 0px 8px rgba(255,255,255,0.5)" }, tap: { scale: 0.9 } };

export default ReturnToLocationButton;
