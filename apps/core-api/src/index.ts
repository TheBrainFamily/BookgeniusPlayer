import { s3 } from "bun";
import path from "path";
import { BUNNY_TOKEN_KEY, generateBunnyToken } from "./auth/bunnyToken";
// We don't need the full authenticator for this step, let's simplify for now
import { authenticateRequest } from "./auth/authenticator";

console.log("🚀 Starting Core API with Versioning...");

const CDN_BASE = process.env.CDN_BASE || "https://bookgenius-b2.b-cdn.net";

// --- In-memory cache for the versions manifest ---
let versionsCache: Record<string, string> = {};

let isLoadingVersions = false;

const assetContext = process.env.ASSET_CONTEXT || "staging";
// For production, path is 'versions.json'. For a branch, it could be 'staging/feature-A/versions.json'
const versionsPath = assetContext === "production" ? "versions.json" : `${assetContext}/versions.json`;

/**
 * Fetches the versions.json file from S3 and populates the cache.
 */
async function loadVersions(): Promise<boolean> {
  if (isLoadingVersions) return false; // Prevent concurrent loads
  isLoadingVersions = true;

  try {
    console.log("[Versioning] Attempting to load versions.json from S3...");
    const versionsFile = s3.file(versionsPath);
    if (await versionsFile.exists()) {
      versionsCache = await versionsFile.json();
      console.log("[Versioning] ✅ Versions cache loaded successfully:", versionsCache);
      isLoadingVersions = false;
      return true;
    } else {
      console.warn("[Versioning] 🟡 versions.json not found in S3 bucket yet.");
      isLoadingVersions = false;
      return false;
    }
  } catch (error) {
    console.error("[Versioning] ❌ Failed to load or parse versions.json:", error.name, error.message);
    isLoadingVersions = false;
    return false;
  }
}

// Load versions on startup
loadVersions();
// Optional: Refresh versions every 5 minutes
setInterval(loadVersions, 5 * 60 * 1000);

// Helper function to determine the correct MIME type based on file extension
const getMimeType = (filePath: string): string => {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case ".js":
    case ".mjs":
      return "application/javascript; charset=utf-8";
    case ".ts":
      return "video/mp2t"; // A standard for TypeScript streams, but JS also works
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".mp4":
      return "video/mp4";
    case ".mp3":
      return "audio/mpeg";
    default:
      return "application/octet-stream";
  }
};

Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);
    const reqPath = url.pathname;

    console.log(`[Core API] Received request for path: ${reqPath}`);

    if (reqPath.startsWith("/content/assets/books/")) {
      // --- NEW: On-demand loading logic ---
      // If cache is empty when a request comes in, try one more time to load it.
      if (Object.keys(versionsCache).length === 0) {
        console.log("[Core API] Versions cache is empty, attempting on-demand load...");
        const success = await loadVersions();
        if (!success) {
          // If it still fails, the service is not ready.
          return new Response("Service Unavailable: Configuration not loaded.", { status: 503 });
        }
      }

      const pathParts = reqPath.substring("/content/".length).split("/");
      const bookSlug = pathParts[2];
      const assetPath = pathParts.slice(3).join("/");

      if (!bookSlug || !assetPath) {
        return new Response("Invalid asset path", { status: 400 });
      }

      const currentVersion = versionsCache[bookSlug];
      if (!currentVersion) {
        console.error(`[Versioning] No version found for book slug: ${bookSlug}`);
        return new Response("Version for book not found", { status: 404 });
      }

      const s3Key = `${assetContext}/assets/books/${bookSlug}/${currentVersion}/${assetPath}`;

      console.log(`[Core API] Mapped request to S3 Key: ${s3Key}`);

      try {
        const s3File = s3.file(s3Key);
        if (!(await s3File.exists())) {
          console.error(`[Core API] File not found in S3: ${s3Key}`);
          return new Response("Not Found", { status: 404 });
        }

        // Determine the correct MIME type for the response
        const mimeType = getMimeType(s3Key);
        console.log(`[Core API] Serving file ${s3Key} with MIME type ${mimeType}`);

        return new Response(s3File.stream(), { headers: { "Content-Type": mimeType, "Content-Length": s3File.size.toString() } });
      } catch (error) {
        console.error("[Core API] Error during S3 operation:", error);
        return new Response("Internal Server Error", { status: 500 });
      }
    }

    // inside Bun.serve().fetch:
    if (reqPath.startsWith("/content/resolve/")) {
      // AUTHORIZE: >>> add your auth check here <<<
      // e.g. await authorizeRequest(req) which should verify session/purchase before issuing tokens.
      // For now it is a no-op allow; replace with real auth.
      const isAuthorized = await authenticateRequest(req); // TODO: replace with real check
      if (!isAuthorized) return new Response("Forbidden", { status: 403 });

      // ensure manifest is in memory
      if (Object.keys(versionsCache).length === 0) {
        const ok = await loadVersions();
        if (!ok) return new Response("Service Unavailable", { status: 503 });
      }

      const slug = decodeURIComponent(reqPath.split("/").pop() || "");
      const version = versionsCache[slug];
      if (!slug || !version) return new Response("Version not found", { status: 404 });

      // Book folder path (leading slash required for signing)
      // Matches the path used by the CDN: /<assetContext>/assets/books/<slug>/<version>/
      const bookFolder = `/${assetContext}/assets/books/${slug}/${version}/`;

      // Generate token scoped to the bookFolder (token_path) with TTL = 6 hours (adjust as needed)
      const TTL_SECONDS = 6 * 3600;
      if (!BUNNY_TOKEN_KEY) {
        console.error("CORE_BUNNY_TOKEN_KEY is not configured; returning unsigned assetBase (not secure).");
        const assetBase = `${CDN_BASE}${bookFolder}`;
        return new Response(JSON.stringify({ slug, version, assetBase }), { headers: { "Content-Type": "application/json" } });
      }

      const { token, expires } = generateBunnyToken(BUNNY_TOKEN_KEY, bookFolder, bookFolder, TTL_SECONDS);

      // Build signed asset base URL that the client will use for all assets under this folder.
      // We include token, expires and token_path as query params.
      const signedAssetBase = `${CDN_BASE}${bookFolder}?expires=${expires}&token=${token}&token_path=${encodeURIComponent(bookFolder)}`;

      return new Response(JSON.stringify({ slug, version, signedAssetBase }), {
        headers: {
          "Content-Type": "application/json",
          // edge-cache this tiny response so it’s ~tens of ms after the first POP hit
          "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=86400",
        },
      });
    }

    // Health check for verification
    if (reqPath === "/health") {
      return new Response(JSON.stringify({ status: "ok", time: new Date() }), { headers: { "Content-Type": "application/json" } });
    }

    console.log(`[Core API] Path "${reqPath}" did not match any routes. Returning 404.`);
    return new Response("Not Found", { status: 404 });
  },
});

console.log(`✅ Core API with Auth (Bun Native S3) is listening on port 3000`);
