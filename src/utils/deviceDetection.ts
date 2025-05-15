/**
 * This utility function checks the user agent string to identify if the device
 * is a mobile. It also considers the viewport width as a fallback
 * for responsive design detection.
 *
 * @returns {boolean} `true` if the device is identified as a mobile, otherwise `false`.
 */
const isMobileDevice = (): boolean => {
  if (typeof window === "undefined") return false;

  const userAgent = navigator.userAgent || navigator.vendor || ("opera" in window ? (window as { opera: string }).opera : undefined);

  // Regular expressions for mobile devices
  const mobileRegex =
    /(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i;
  // Alternative: check viewport width for a responsive approach
  // 768px is a common breakpoint for mobiles
  const isSmallViewport = window.innerWidth <= 768;

  return mobileRegex.test(userAgent) || isSmallViewport;
};

/**
 * This utility function checks the user agent string to identify if the device
 * is a tablet. It also considers the viewport width as a fallback
 * for responsive design detection.
 *
 * @returns {boolean} `true` if the device is identified as a tablet, otherwise `false`.
 */
const isTabletDevice = (): boolean => {
  if (typeof window === "undefined") return false;

  const userAgent = navigator.userAgent || navigator.vendor || ("opera" in window ? (window as { opera: string }).opera : undefined);

  // Regular expressions tablet devices
  const tabletRegex = /android|ipad|playbook|silk/i;

  // Alternative: check viewport width for a responsive approach
  // 1024px is a common breakpoint for tablets
  const isSmallViewport = window.innerWidth <= 1024;

  return tabletRegex.test(userAgent) || isSmallViewport;
};

/**
 * This utility function checks the user agent string to identify if the device
 * is a mobile or tablet. It also considers the viewport width as a fallback
 * for responsive design detection.
 *
 * @returns {boolean} `true` if the device is identified as a mobile or tablet, otherwise `false`.
 */
export const isMobileOrTabletDevice = (): boolean => {
  return isMobileDevice() || isTabletDevice();
};
