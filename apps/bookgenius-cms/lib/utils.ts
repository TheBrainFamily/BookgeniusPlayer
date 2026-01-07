import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function getContentTypeCategory(
  contentType: string | undefined,
): "image" | "audio" | "video" | "text" | "json" | "other" {
  if (!contentType) return "other";
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("audio/")) return "audio";
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("text/")) return "text";
  if (contentType === "application/json") return "json";
  return "other";
}

export function logError(contextMessage: string, err: unknown) {
  if (err instanceof Error) {
    console.error(`${contextMessage} ${err.message}`);
    console.error(err.stack);
    return;
  }

  console.error(`${contextMessage} ${String(err)}`);
}
