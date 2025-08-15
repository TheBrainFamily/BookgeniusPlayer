import { getBookAssetBaseUrl } from "@/utils/assetUrls";

// ---- Helper Function --------------------------------------------------------
export function getFileType(filename: string): "video" | "image" | "unknown" {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (!ext) return "unknown";
  if (["mp4", "webm", "ogv"].includes(ext)) return "video";
  if (["png", "jpg", "jpeg", "gif", "webp", "avif", "svg"].includes(ext)) return "image";
  return "unknown";
}

// ---- Helper Function --------------------------------------------------------
export const getSourceForFile = (newFile: string) => {
  return `${getBookAssetBaseUrl()}/${newFile}`;
};

// ---- Helper Function --------------------------------------------------------
export const loadVideoAsHTMLElement = (nextBack: HTMLVideoElement, newSrc: string) => {
  nextBack.src = newSrc;
  nextBack.load();
  return nextBack;
};
