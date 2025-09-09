import { useEffect, useState } from "react";
import { AnimatePresence, motion, Variants } from "motion/react";

import BottomInput from "./BottomInput";
import { useWebSocket } from "@player/context/WebSocketContext";
import useSplashHidden from "@player/hooks/useSplashHidden";
import { useIsMobileOrTablet } from "@player/hooks/useIsMobileOrTablet";
import { getBookData } from "@player/genericBookDataGetters/getBookData";
import CharactersOnStagePanel from "./CharactersOnStagePanel";
import { useContentShift } from "@player/stores/contentShift.store";
import { cn } from "@player/lib/utils";

const Footer = () => {
  const { sendMessage } = useWebSocket();
  const isSplashHidden = useSplashHidden();
  const isMobileOrTablet = useIsMobileOrTablet();
  const { isContentShiftedLeft } = useContentShift();
  const {
    metadata: { bookForm },
  } = getBookData();

  const [isRightNotesBlankHidden, setIsRightNotesBlankHidden] = useState(false);
  const [isLargeScreen, setIsLargeScreen] = useState(false);

  useEffect(() => {
    setIsRightNotesBlankHidden(isMobileOrTablet);
  }, [isMobileOrTablet]);

  useEffect(() => {
    const checkScreenSize = () => {
      setIsLargeScreen(window.innerWidth >= 1280);
    };

    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  // Determine if footer should be shifted left
  const shouldShiftFooter = isContentShiftedLeft && isLargeScreen;

  const footerShiftClass = bookForm === "play" ? "-translate-x-[14%]" : "-translate-x-[11.5%]";
  return (
    <AnimatePresence>
      {isSplashHidden && (
        <motion.footer
          variants={footerVariants}
          initial="hidden"
          animate="visible"
          className={cn(
            "fixed bottom-0 inset-x-0 z-50 flex flex-row gap-2 justify-center mx-auto max-w-[120rem] w-full pointer-events-none",
            "px-2 lg:px-4 pb-4",
            // Always apply transition, but only apply transform when shifting
            "transition-transform duration-300",
            shouldShiftFooter ? `transform ${footerShiftClass}` : "",
          )}
        >
          {bookForm === "play" ? (
            <>
              <div
                className={cn(
                  "w-full sm:flex-3 px-0 flex flex-col sm:px-3 xl:px-2 space-y-3 items-center pointer-events-auto",
                  // Adjust width when footer is shifted to avoid modal overlap
                  shouldShiftFooter ? "max-w-[70vw]" : "",
                )}
              >
                <CharactersOnStagePanel />
                <BottomInput className={cn("max-w-[800px]", shouldShiftFooter ? "max-w-[600px]" : "")} onSubmit={sendMessage} />
              </div>
            </>
          ) : (
            <>
              <div id="left-notes-blank" className="hidden sm:block sm:flex-1 max-w-[700px]" />
              <div className={cn("w-full sm:flex-3 max-w-[900px] flex flex-col sm:pl-4 pointer-events-auto", shouldShiftFooter ? "max-w-[70vw]" : "")}>
                <BottomInput onSubmit={sendMessage} />
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
