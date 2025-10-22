import { useEffect, useState } from "react";

export const useScreenSize = () => {
  const [isLargeScreen, setIsLargeScreen] = useState(false);
  const [isMediumScreen, setIsMediumScreen] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  useEffect(() => {
    const checkScreenSize = () => {
      const large = window.innerWidth >= 1280;
      const medium = window.innerWidth >= 1024 && window.innerWidth < 1280;
      const small = window.innerWidth < 1024;

      setIsLargeScreen(large);
      setIsMediumScreen(medium);
      setIsSmallScreen(small);
    };

    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  return { isLargeScreen, isMediumScreen, isSmallScreen };
};
