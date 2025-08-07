import { useEffect, useState } from "react";
import { AnimatePresence, motion, Variants } from "motion/react";

import BottomInput from "./BottomInput";
import { useWebSocket } from "@/context/WebSocketContext";
import useSplashHidden from "@/hooks/useSplashHidden";
import { useIsMobileOrTablet } from "@/hooks/useIsMobileOrTablet";
import { getBookData } from "@/genericBookDataGetters/getBookData";
import CharactersOnStagePanel from "./CharactersOnStagePanel";
import { cn } from "@/lib/utils";

const Footer = () => {
  const { sendMessage } = useWebSocket();
  const isSplashHidden = useSplashHidden();
  const isMobileOrTablet = useIsMobileOrTablet();
  const {
    metadata: { bookForm },
  } = getBookData();

  const [isRightNotesBlankHidden, setIsRightNotesBlankHidden] = useState(false);

  useEffect(() => {
    setIsRightNotesBlankHidden(isMobileOrTablet);
  }, [isMobileOrTablet]);

  return (
    <AnimatePresence>
      {isSplashHidden && (
        <motion.footer
          variants={footerVariants}
          initial="hidden"
          animate="visible"
          className={cn(
            "fixed bottom-0 inset-x-0 z-50 flex flex-row gap-2 justify-center mx-auto max-w-[120rem] w-full pointer-events-none",
            "px-2 py-3 sm:pr-0 xl:px-4 sm:pl-4",
            bookForm === "play" ? "!px-3" : "",
          )}
        >
          {bookForm === "play" ? (
            <>
              <div className="w-full sm:flex-3 max-w-[800px] px-0 flex flex-col sm:px-3 xl:px-2 space-y-3 pointer-events-auto">
                <CharactersOnStagePanel />
                <BottomInput onSubmit={sendMessage} />
              </div>
            </>
          ) : (
            <>
              <div id="left-notes-blank" className="hidden sm:block sm:flex-1 max-w-[700px]" />
              <div className="w-full sm:flex-3 max-w-[900px] px-0 flex flex-col sm:ml-2 sm:px-3 xl:ml-0 xl:px-2 space-y-3 pointer-events-auto">
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
