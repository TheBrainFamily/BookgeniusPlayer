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
    <AnimatePresence>
      {isSplashHidden && (
        <motion.header
          variants={headerVariants}
          initial="hidden"
          animate="visible"
          className={cn("fixed top-0 left-0 right-0 z-50 flex items-center max-w-[120rem] w-full mx-auto", "gap-2 md:gap-3 lg:gap-4 p-2 md:p-3 lg:p-5")}
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

const headerVariants: Variants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { duration: 4, delay: 2 } } };
