import { useState, useEffect } from "react";

import { isMobileOrTablet } from "@/utils/isMobileOrTablet";

/**
 * React hook that listens for viewport width changes and orientation changes
 * to detect if the device is a mobile or tablet. Use this hook in React components
 * to reactively respond to device type changes.
 *
 * @returns {boolean} `true` if the device is identified as a mobile or tablet, otherwise `false`.
 */
export const useIsMobileOrTablet = (): boolean => {
  const [_isMobileOrTablet, setIsMobileOrTablet] = useState<boolean>(false);

  useEffect(() => {
    const checkIfMobileOrTablet = () => {
      setIsMobileOrTablet(isMobileOrTablet());
    };

    // Initial check
    checkIfMobileOrTablet();

    // Add event listeners for window resize and orientation change
    window.addEventListener("resize", checkIfMobileOrTablet);
    window.addEventListener("orientationchange", checkIfMobileOrTablet);

    // Clean up event listeners
    return () => {
      window.removeEventListener("resize", checkIfMobileOrTablet);
      window.removeEventListener("orientationchange", checkIfMobileOrTablet);
    };
  }, []);

  return _isMobileOrTablet;
};
