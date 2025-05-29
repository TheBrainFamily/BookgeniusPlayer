/**
 * This utility function checks the user agent string to identify if the device
 * is a mobile or tablet. It also considers the viewport width as a fallback
 * for responsive design detection.
 *
 * @returns {boolean} `true` if the device is identified as a mobile or tablet, otherwise `false`.
 */
export const isMobileOrTablet = (): boolean => {
  if (typeof window === "undefined") return false;

  const userAgent = navigator.userAgent || navigator.vendor || ("opera" in window ? (window as { opera: string }).opera : undefined);

  // Regular expressions for mobile and tablet devices
  const mobileRegex =
    /(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i;
  const tabletRegex = /android|ipad|playbook|silk/i;

  // Enhanced iPad detection for modern iPadOS devices
  // Modern iPads (especially iPad Pro) may report as desktop Safari or Chrome
  const isIPad = /iPad/i.test(userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) || (/Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1);

  // Check for touch capability as additional indicator
  const hasTouchScreen = "ontouchstart" in window || navigator.maxTouchPoints > 0;

  // Additional check for iPad Pro in desktop mode (Chrome, etc.)
  // These devices often have specific screen resolutions and touch capabilities
  const isProbablyIPadPro = navigator.maxTouchPoints > 0 || "ontouchstart" in window || /Macintosh/i.test(userAgent); // iPad in desktop mode often reports as Mac

  // Alternative: check viewport width for a responsive approach
  // 1024px is a common breakpoint for tablets
  const isSmallViewport = window.innerWidth <= 1280;

  const isMobileOrTabletDevice = mobileRegex.test(userAgent) || tabletRegex.test(userAgent) || isIPad || isProbablyIPadPro || (hasTouchScreen && isSmallViewport);

  return isMobileOrTabletDevice;
};
