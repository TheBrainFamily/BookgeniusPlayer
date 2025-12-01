import { useEffect, useState } from "react";

const getScreenSizes = () => {
  if (typeof window === "undefined") {
    return { large: false, medium: false, small: true };
  }
  const width = window.innerWidth;
  return { large: width >= 1280, medium: width >= 1024 && width < 1280, small: width < 1024 };
};

export const useScreenSize = () => {
  const [isLargeScreen, setIsLargeScreen] = useState(() => getScreenSizes().large);
  const [isMediumScreen, setIsMediumScreen] = useState(() => getScreenSizes().medium);
  const [isSmallScreen, setIsSmallScreen] = useState(() => getScreenSizes().small);

  useEffect(() => {
    const checkScreenSize = () => {
      const sizes = getScreenSizes();
      setIsLargeScreen(sizes.large);
      setIsMediumScreen(sizes.medium);
      setIsSmallScreen(sizes.small);
    };

    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  return { isLargeScreen, isMediumScreen, isSmallScreen };
};
