/**
 * Extracts platform ID from hostname using eTLD+1 heuristic.
 * Examples:
 *   bookgenius.snapplify.com → snapplify.com
 *   somebranch.branches.bookgeniusz.pl → bookgeniusz.pl
 *   localhost → localhost
 *
 * Also supports override via ?platformId=... query param for testing.
 */
export const getPlatformId = (): string => {
  // Check for query param override
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const override = params.get("platformId");
    if (override) {
      return override;
    }
  }

  const hostname = typeof window !== "undefined" ? window.location.hostname : "unknown";

  // Handle localhost and IP addresses
  if (hostname === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return hostname;
  }

  // Split by dots and take last two parts (eTLD+1)
  const parts = hostname.split(".");
  if (parts.length >= 2) {
    return parts.slice(-2).join(".");
  }

  // Fallback to full hostname if only one part
  return hostname;
};
