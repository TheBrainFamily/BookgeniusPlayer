import { AnimatePresence, motion, type Variants } from "motion/react";

import useSplashHidden from "@player/hooks/useSplashHidden";
import { useIsMobileOrTablet } from "@player/hooks/useIsMobileOrTablet";
import { useBookForm } from "@player/hooks/useBookForm";
import BottomInput from "./BottomInput";
import CharactersOnStagePanel from "./CharactersOnStagePanel";
import { cn } from "@player/lib/utils";

const Footer = () => {
  const isSplashHidden = useSplashHidden();
  const isMobileOrTablet = useIsMobileOrTablet();
  const { isPlayFormat } = useBookForm();

  return (
    <AnimatePresence>
      {isSplashHidden && (
        <motion.footer
          variants={footerVariants}
          initial="hidden"
          animate="visible"
          className={cn(
            "fixed inset-x-0 bottom-0 z-40",
            "flex flex-row justify-center mx-auto px-0 max-w-[120rem] w-full",
            "pointer-events-none",
            "pb-4",
          )}
        >
          {isPlayFormat ? (
            <>
              <div
                id="bottom-input-wrapper"
                className={cn(
                  "w-full sm:flex-3 flex flex-col sm:px-3 space-y-3 items-center pointer-events-auto",
                )}
              >
                <CharactersOnStagePanel />
                <BottomInput className={cn("max-w-[800px]")} />
              </div>
            </>
          ) : (
            <>
              <div
                id="left-notes-blank"
                className="w-0 hidden sm:block sm:flex-1 sm:w-auto max-w-[700px] content-center pointer-events-none"
              />
              <div
                id="bottom-input-wrapper"
                className={cn(
                  "sm:flex-3 max-w-[800px] xl:max-w-[850px] xxl:max-w-[900px] pointer-events-auto w-full sm:w-auto px-2 sm:px-4 xl:px-0 ",
                )}
              >
                <BottomInput />
              </div>
              <div
                id="right-notes-blank"
                className={cn(
                  "hidden xl:block xl:flex-1 max-w-[700px] pointer-events-none",
                  isMobileOrTablet && "hidden",
                )}
              />
            </>
          )}
        </motion.footer>
      )}
    </AnimatePresence>
  );
};

export default Footer;

const footerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 4, delay: 2 } },
};
