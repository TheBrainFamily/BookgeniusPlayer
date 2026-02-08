// ---- Helper Function --------------------------------------------------------
export function getFileType(filename: string): "video" | "image" | "unknown" {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (!ext) return "unknown";
  if (["mp4", "webm", "ogv"].includes(ext)) return "video";
  if (["png", "jpg", "jpeg", "gif", "webp", "avif", "svg"].includes(ext)) return "image";
  return "unknown";
}

// ---- Book-level media type (cached per book) --------------------------------
import { getBackgrounds } from "./getBackgrounds";

let cachedBookMediaType: "video" | "image" | null = null;

/**
 * Returns "video" or "image" based on the first background of the current book.
 * Cached so the value is stable for the entire session — avoids opacity flicker
 * when individual chapters switch between image/video backgrounds.
 */
export function getBookMediaType(): "video" | "image" {
  if (cachedBookMediaType) return cachedBookMediaType;
  const backgrounds = getBackgrounds();
  if (backgrounds.length > 0) {
    const type = getFileType(backgrounds[0].file);
    cachedBookMediaType = type === "video" ? "video" : "image";
  } else {
    cachedBookMediaType = "image"; // default fallback
  }
  return cachedBookMediaType;
}

export function resetBookMediaTypeCache() {
  cachedBookMediaType = null;
}

// ---- Helper Function --------------------------------------------------------
export const loadVideoAsHTMLElement = (nextBack: HTMLVideoElement, newSrc: string) => {
  nextBack.src = newSrc;
  nextBack.load();
  return nextBack;
};
