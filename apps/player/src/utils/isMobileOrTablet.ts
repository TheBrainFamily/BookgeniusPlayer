/**
 * This utility function checks the user agent string to identify if the device
 * is a mobile device. It uses a combination of user agent detection and
 * device characteristics while being more conservative to avoid false positives
 * on desktop browsers.
 *
 * @param {boolean} considerViewportWidth - Whether to consider viewport width in mobile detection
 * @param {number} mobileMaxWidth - Maximum width to consider as mobile (default: 768px)
 * @returns {boolean} `true` if the device is identified as a mobile device, otherwise `false`.
 */
export const isMobile = (considerViewportWidth = false, mobileMaxWidth = 768): boolean => {
  if (typeof window === "undefined") return false;

  const userAgent = navigator.userAgent || navigator.vendor || "";

  // Check for explicit mobile indicators in user agent
  const mobileRegex =
    /(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i;

  // Check for explicit mobile devices first
  if (mobileRegex.test(userAgent)) {
    return true;
  }

  // For responsive design purposes, also check viewport width if enabled
  const isNarrowViewport = window.innerWidth <= mobileMaxWidth;
  if (considerViewportWidth && isNarrowViewport) {
    return true;
  } else {
    const hasTouchScreen = "ontouchstart" in window || navigator.maxTouchPoints > 0;

    // Only consider it mobile if it's both touch-enabled AND narrow
    // This helps avoid false positives on desktop browsers with touch screens
    if (hasTouchScreen && isNarrowViewport) {
      return true;
    }
  }

  return false;
};

/**
 * This utility function checks the user agent string to identify if the device
 * is a tablet. It uses a combination of user agent detection and
 * device characteristics while being more conservative to avoid false positives
 * on desktop browsers.
 *
 * @param {boolean} considerViewportWidth - Whether to consider viewport width in tablet detection
 * @param {number} tabletMinWidth - Minimum width to consider as tablet (default: 768px)
 * @param {number} tabletMaxWidth - Maximum width to consider as tablet (default: 1024px)
 * @returns {boolean} `true` if the device is identified as a tablet, otherwise `false`.
 */
export const isTablet = (
  considerViewportWidth = false,
  tabletMinWidth = 768,
  tabletMaxWidth = 1024,
): boolean => {
  if (typeof window === "undefined") return false;

  const userAgent = navigator.userAgent || navigator.vendor || "";

  // Check for tablets (but be more specific)
  const androidTabletRegex = /android(?!.*mobile)/i;
  const iPadRegex = /iPad/i;
  const playBookRegex = /PlayBook/i;
  const silkRegex = /Silk/i;

  // Check for known tablet patterns
  if (
    androidTabletRegex.test(userAgent) ||
    iPadRegex.test(userAgent) ||
    playBookRegex.test(userAgent) ||
    silkRegex.test(userAgent)
  ) {
    return true;
  }

  // Enhanced iPad detection for modern iPadOS devices that report as desktop Safari
  // Only consider it an iPad if it's MacIntel with touch AND has tablet-like screen dimensions
  const screenMin = Math.min(window.screen.width, window.screen.height);
  const screenMax = Math.max(window.screen.width, window.screen.height);

  const isModernIPad =
    navigator.platform === "MacIntel" &&
    navigator.maxTouchPoints >= 1 &&
    // All modern iPad models (including Mini, Air and Pro) have a shortest side >= 744px in CSS pixels.
    screenMin >= 744 &&
    // Longest side for current iPads is 1366px in CSS pixels. Keep a ceiling to avoid false positives.
    screenMax <= 1366;

  if (isModernIPad) {
    return true;
  }

  // For responsive design purposes, also check viewport width if enabled
  const currentWidth = window.innerWidth;
  const isTabletViewport = currentWidth >= tabletMinWidth && currentWidth <= tabletMaxWidth;

  if (considerViewportWidth && isTabletViewport) {
    return true;
  } else {
    // Only use touch detection when not considering viewport width
    const hasTouchScreen = "ontouchstart" in window || navigator.maxTouchPoints > 0;

    // Consider it a tablet if it's touch-enabled AND in tablet width range
    if (hasTouchScreen && isTabletViewport) {
      return true;
    }
  }

  return false;
};

/**
 * This utility function checks the user agent string to identify if the device
 * is a mobile or tablet. It uses a combination of user agent detection and
 * device characteristics while being more conservative to avoid false positives
 * on desktop browsers.
 *
 * @param {boolean} considerViewportWidth - Whether to consider viewport width in detection
 * @param {number} mobileMaxWidth - Maximum width to consider as mobile (default: 768px)
 * @param {number} tabletMinWidth - Minimum width to consider as tablet (default: 768px)
 * @param {number} tabletMaxWidth - Maximum width to consider as tablet (default: 1024px)
 * @returns {boolean} `true` if the device is identified as a mobile or tablet, otherwise `false`.
 */
export const isMobileOrTablet = (
  considerViewportWidth = true,
  mobileMaxWidth = 768,
  tabletMinWidth = 768,
  tabletMaxWidth = 1024,
): boolean => {
  return (
    isMobile(considerViewportWidth, mobileMaxWidth) ||
    isTablet(considerViewportWidth, tabletMinWidth, tabletMaxWidth)
  );
};
