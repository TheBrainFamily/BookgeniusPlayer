import React from "react";
import { AnimatePresence, motion, Variants } from "motion/react";

import { cn } from "@/lib/utils";
import useSplashHidden from "@/hooks/useSplashHidden";

import MenuButton from "./MenuButton";
import AudioPlayer from "./AudioPlayer";
import ReturnToLocationButton from "./ReturnToLocationButton";

const Header = () => {
  const isSplashHidden = useSplashHidden();

  return (
    <AnimatePresence mode="wait" initial={false}>
      {isSplashHidden && (
        <motion.header
          variants={headerVariants}
          initial="hidden"
          animate="visible"
          className={cn("fixed top-0 left-0 right-0 z-50 flex items-center p-4 gap-4 max-w-[120rem] w-full mx-auto", "optional-element")}
        >
          <MenuButton />
          <AudioPlayer />
          <ReturnToLocationButton />
        </motion.header>
      )}
    </AnimatePresence>
  );
};

export default Header;

const headerVariants: Variants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { duration: 2, delay: 2.5 } } };
