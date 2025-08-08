import { useState, useEffect } from "react";
import { AnimatePresence, motion, Variants } from "motion/react";
import { ListMusic } from "lucide-react";

const Fallback = () => (
  <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-gradient-to-br from-white/20 to-white/5 group-hover:scale-105 transition-transform duration-300 z-1">
    <ListMusic className="w-8 h-8 text-white/70" />
  </div>
);

interface CoverArtProps {
  src: string | null | undefined;
}

export const CoverArt = ({ src }: CoverArtProps) => {
  // Keep track of the image that is currently being displayed
  const [displayedSrc, setDisplayedSrc] = useState<string | null | undefined>(src);
  const [hasError, setHasError] = useState(false);

  // Whenever the requested src changes, start pre-loading it.
  // Only switch the "displayedSrc" once the new image has finished loading
  // so that the previously shown cover remains visible during the transition.
  useEffect(() => {
    // If no new src is provided, show the fallback icon.
    if (!src) {
      setDisplayedSrc(null);
      setHasError(true);
      return;
    }

    // If we are already showing the correct image, nothing to do.
    if (src === displayedSrc) return;

    setHasError(false);

    const img = new Image();
    img.src = src;

    img.onload = () => {
      setDisplayedSrc(src);
      setHasError(false);
    };

    img.onerror = () => {
      setHasError(true);
    };

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [src, displayedSrc]);

  if (!displayedSrc || hasError) {
    return (
      <div className="relative w-full h-full group">
        <Fallback />
      </div>
    );
  }

  return (
    <div className="relative w-full h-full group">
      <AnimatePresence /* default mode="sync" gives us overlapping enter/exit for a smooth cross-fade */>
        <motion.img
          key={displayedSrc}
          src={displayedSrc}
          alt="Cover Art"
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 z-2"
          variants={artVariants}
          initial="initial"
          animate="animate"
          exit="exit"
        />
      </AnimatePresence>
    </div>
  );
};

const artVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.25, ease: "easeIn" } },
  exit: { opacity: 0, transition: { duration: 0.25, ease: "easeOut" } },
};
