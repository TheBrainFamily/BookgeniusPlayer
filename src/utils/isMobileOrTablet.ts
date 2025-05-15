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

  // Alternative: check viewport width for a responsive approach
  // 1024px is a common breakpoint for tablets
  const isSmallViewport = window.innerWidth <= 1280;

  return mobileRegex.test(userAgent) || tabletRegex.test(userAgent) || isSmallViewport;
};
