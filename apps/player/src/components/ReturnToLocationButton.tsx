import { useEffect, useState } from "react";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { UndoDot } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  shouldShowReturnButton,
  systemNavigateTo,
  getSavedLocation,
} from "@player/helpers/paragraphsNavigation";
import { Tooltip, TooltipContent, TooltipTrigger } from "@player/components/ui/tooltip";
import { useLocationRange } from "@player/hooks/useLocationRange";
import { OptionalElement } from "./OptionalElement";

const ReturnToLocationButton = () => {
  const [isVisible, setIsVisible] = useState(false);
  const {
    locationRange: { currentChapter, currentParagraph },
  } = useLocationRange(300);
  const { t } = useTranslation();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Deriving visibility from location
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
    if (!savedLocation) {
      return;
    }

    // Smooth navigation with full chapter range between current and saved.
    systemNavigateTo(
      {
        currentChapter: savedLocation.currentChapter,
        currentParagraph: savedLocation.currentParagraph,
      },
      { behavior: "smooth", expandChapterRange: true, history: "push" },
    );

    setIsVisible(false);
  };

  return (
    <AnimatePresence>
      <OptionalElement>
        {isVisible && (
          <motion.div
            className="bg-black/70 textured-bg rounded-3xl border shadow-xl text-white border-white/30 px-1 flex items-center"
            initial="hidden"
            animate="visible"
            exit="hidden"
            variants={variants.container}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <motion.button
                  onPointerUp={(e) => {
                    e.preventDefault();
                    onGoBackClick();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onGoBackClick();
                    }
                  }}
                  className="p-2 my-1 leading-none text text-[10px] md:text-sm hover:text-white rounded-full cursor-pointer flex flex-row gap-2 items-center font-medium"
                  whileHover="hover"
                  whileTap="tap"
                  variants={variants.button}
                >
                  <UndoDot className="w-[14px] h-[14px] md:w-4 md:h-4 lg:w-5 lg:h-5" />
                  {t("go_back")}
                </motion.button>
              </TooltipTrigger>
              <TooltipContent>{t("return_to_last_reading_location")}</TooltipContent>
            </Tooltip>
          </motion.div>
        )}
      </OptionalElement>
    </AnimatePresence>
  );
};

const variants: Record<string, Variants> = {
  container: {
    hidden: { opacity: 0, scale: 0.8, transition: { duration: 0.2 } },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.2 } },
  },
  button: {
    hover: {
      backgroundColor: "rgba(255,255,255,0.2)",
      boxShadow: "0px 0px 8px rgba(255,255,255,0.5)",
    },
    tap: { scale: 0.9 },
  },
};

export default ReturnToLocationButton;
