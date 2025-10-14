import { useEffect, useState } from "react";
import { AnimatePresence, motion, Variants } from "motion/react";

import BottomInput from "./BottomInput";
import useSplashHidden from "@player/hooks/useSplashHidden";
import { useIsMobileOrTablet } from "@player/hooks/useIsMobileOrTablet";
import { getBookData } from "@player/genericBookDataGetters/getBookData";
import CharactersOnStagePanel from "./CharactersOnStagePanel";
import { useContentShift } from "@player/stores/contentShift.store";
import { cn } from "@player/lib/utils";

const Footer = () => {
  const isSplashHidden = useSplashHidden();
  const isMobileOrTablet = useIsMobileOrTablet();
  const { isContentShiftedLeft } = useContentShift();
  const {
    metadata: { bookForm },
  } = getBookData();

  const [isRightNotesBlankHidden, setIsRightNotesBlankHidden] = useState(false);
  const [isLargeScreen, setIsLargeScreen] = useState(false);
  const [isMediumScreen, setIsMediumScreen] = useState(false);

  useEffect(() => {
    setIsRightNotesBlankHidden(isMobileOrTablet);
  }, [isMobileOrTablet]);

  useEffect(() => {
    const checkScreenSize = () => {
      setIsLargeScreen(window.innerWidth >= 1280 && window.innerWidth <= 2000);
      setIsMediumScreen(window.innerWidth >= 1024 && window.innerWidth < 1280);
    };

    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  // Determine if footer should be shifted left
  const shouldShiftFooterLargeScreen = isContentShiftedLeft && isLargeScreen;
  const shouldShiftFooterMediumScreen = isContentShiftedLeft && isMediumScreen;

  const getFooterWidthClasses = () => {
    if (shouldShiftFooterLargeScreen) {
      return "w-[80%] max-w-[calc(120rem*0.8)] left-0";
    } else if (shouldShiftFooterMediumScreen) {
      return "w-[66%] max-w-[calc(120rem*0.8)] left-0";
    }

    return "w-full max-w-[120rem] inset-x-0";
  };

  return (
    <AnimatePresence>
      {isSplashHidden && (
        <motion.footer
          variants={footerVariants}
          initial="hidden"
          animate="visible"
          className={cn(
            "fixed bottom-0 z-40 flex flex-row gap-2 justify-center mx-auto pointer-events-none",
            "px-2 lg:px-4 pb-4",
            "transition-transform duration-300",
            getFooterWidthClasses(),
          )}
        >
          {bookForm === "play" || bookForm === "mixed" ? (
            <>
              <div className={cn("w-full sm:flex-3 px-0 flex flex-col sm:px-3 xl:px-2 space-y-3 items-center pointer-events-auto")}>
                <CharactersOnStagePanel />
                <BottomInput className={cn("max-w-[800px]")} />
              </div>
            </>
          ) : (
            <>
              <div id="left-notes-blank" className="hidden sm:block sm:flex-1 max-w-[700px]" />
              <div className={cn("w-full sm:flex-3 max-w-[900px] flex flex-col pointer-events-auto", !shouldShiftFooterLargeScreen && !shouldShiftFooterMediumScreen && "sm:pl-4")}>
                <BottomInput />
              </div>
              {!isRightNotesBlankHidden && <div id="right-notes-blank" className="hidden xl:block xl:flex-1 max-w-[700px]" />}
            </>
          )}
        </motion.footer>
      )}
    </AnimatePresence>
  );
};

export default Footer;

const footerVariants: Variants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { duration: 4, delay: 2 } } };
