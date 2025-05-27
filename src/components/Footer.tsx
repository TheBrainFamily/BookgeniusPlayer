import React, { useEffect, useState } from "react";
import { AnimatePresence, motion, Variants } from "motion/react";

import BottomInput from "./BottomInput";
import { useWebSocket } from "@/context/WebSocketContext";
import useSplashHidden from "@/hooks/useSplashHidden";
import { useIsMobileOrTablet } from "@/hooks/useIsMobileOrTablet";
import { cn } from "@/lib/utils";

const Footer = () => {
  const { sendMessage } = useWebSocket();
  const isSplashHidden = useSplashHidden();
  const isMobileOrTablet = useIsMobileOrTablet();

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
          className={cn("fixed bottom-0 p-4 inset-x-0 z-50 flex flex-row gap-2 justify-center mx-auto pl-2 pr-2 md:pr-0 xl:px-4 md:pl-4 max-w-[120rem] w-full", "optional-element")}
        >
          {/* Left blank space */}
          <div id="left-notes-blank" className="hidden md:block md:flex-1 max-w-[700px]" />
          <BottomInput onSubmit={sendMessage} className="flex-2 md:min-w-[600px] max-w-[900px] px-4" />
          {/* Right blank space */}
          {!isRightNotesBlankHidden && <div id="right-notes-blank" className="hidden xl:block xl:flex-1 max-w-[700px]" />}
        </motion.footer>
      )}
    </AnimatePresence>
  );
};

export default Footer;

const footerVariants: Variants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { duration: 2, delay: 2.5 } } };
