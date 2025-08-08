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
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (src) {
      setIsLoaded(false);
      setHasError(false);
    } else {
      setIsLoaded(false);
      setHasError(true);
    }
  }, [src]);

  if (!src || hasError) {
    return (
      <div className="relative w-full h-full group">
        <Fallback />
      </div>
    );
  }

  return (
    <div className="relative w-full h-full group">
      <Fallback />

      <AnimatePresence mode="wait">
        {isLoaded && (
          <motion.img
            key={src}
            src={src}
            alt="Cover Art"
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 z-2"
            onLoad={() => setIsLoaded(true)}
            onError={() => setHasError(true)}
            variants={artVariants}
            initial="initial"
            animate="animate"
            exit="initial"
          />
        )}
      </AnimatePresence>

      <img key={src + "_loader"} src={src} className="hidden" onLoad={() => setIsLoaded(true)} onError={() => setHasError(true)} alt="" />
    </div>
  );
};

const artVariants: Variants = { initial: { opacity: 0 }, animate: { opacity: 1, transition: { duration: 0.25, ease: "easeIn" } } };
