import { AnimatePresence, motion, Variants } from "motion/react";

import { cn } from "@player/lib/utils";
import useSplashHidden from "@player/hooks/useSplashHidden";

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
          className={cn("fixed top-0 inset-x-0 z-50 flex items-center max-w-[120rem] w-full mx-auto", "gap-1 md:gap-2 px-2 pt-4")}
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
