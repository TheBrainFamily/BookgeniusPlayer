export function urlExt(u: string): string {
  try {
    const { pathname } = new URL(
      u,
      typeof window !== "undefined" ? window.location.origin : "http://x",
    );
    const name = pathname.substring(pathname.lastIndexOf("/") + 1);
    const dot = name.lastIndexOf(".");
    return dot >= 0 ? name.slice(dot).toLowerCase() : "";
  } catch {
    const p = u.split("#")[0].split("?")[0];
    const name = p.substring(p.lastIndexOf("/") + 1);
    const dot = name.lastIndexOf(".");
    return dot >= 0 ? name.slice(dot).toLowerCase() : "";
  }
}

const VIDEO_EXT = new Set([".mp4", ".webm"]);

export const isVideoFile = (u: string) => VIDEO_EXT.has(urlExt(u));
