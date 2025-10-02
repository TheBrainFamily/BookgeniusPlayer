// Utilities for build info formatting

export const formatTimeAgo = (timestampMs: number): string => {
  const now = Date.now();
  const diffMs = Math.max(0, now - timestampMs);
  const seconds = Math.floor(diffMs / 1000);

  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"} ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
};

export const getReadableBuildInfo = (raw: string | undefined): string => {
  if (!raw) return "0.0.1";
  const lastDash = raw.lastIndexOf("-");
  if (lastDash === -1) return raw;

  const context = raw.slice(0, lastDash);
  const tsStr = raw.slice(lastDash + 1);
  const tsNum = Number(tsStr);
  if (!Number.isFinite(tsNum)) return raw;

  // Env provides epoch seconds; convert to ms if needed
  const tsMs = tsNum < 1e12 ? tsNum * 1000 : tsNum;
  return `${context} ${formatTimeAgo(tsMs)}`;
};
