import React, { useEffect, useState } from "react";
import { AnimatePresence, motion, Variants } from "motion/react";
import { UndoDot } from "lucide-react";

import { shouldShowReturnButton, systemNavigateTo, getSavedLocation } from "@/helpers/paragraphsNavigation";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLocation } from "@/state/LocationContext";
import { useDebounce } from "@/hooks/useDebounce";
import { useTranslation } from "react-i18next";

const ReturnToLocationButton = () => {
  const [isVisible, setIsVisible] = useState(false);
  const { location } = useLocation();
  const { currentChapter, currentParagraph } = useDebounce(location, 300);
  const { t } = useTranslation();

  useEffect(() => {
    setIsVisible(shouldShowReturnButton());
  }, [currentParagraph, currentChapter]);

  const onGoBackClick = () => {
    const savedLocation = getSavedLocation();
    systemNavigateTo({ currentChapter: savedLocation.currentChapter, currentParagraph: savedLocation.currentParagraph });
    setIsVisible(false);
  };
  console.log("go back button visible", isVisible);

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
                {t("go_back")}
              </motion.button>
            </TooltipTrigger>
            <TooltipContent>{t("return_to_last_reading_location")}</TooltipContent>
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
