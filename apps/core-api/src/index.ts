import { s3 } from "bun";
import path from "path";
// We don't need the full authenticator for this step, let's simplify for now
// import { authenticateRequest } from './auth/authenticator';

console.log("🚀 Starting Core API with Versioning...");

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

/**
 * Tries to load the initial versions manifest with a retry mechanism.
 */
async function initialLoadWithRetry(retries = 10, delay = 5000) {
  for (let i = 1; i <= retries; i++) {
    console.log(`[Versioning] Initial load attempt ${i}/${retries}...`);
    const success = await loadVersions();
    if (success) {
      console.log("[Versioning] Initial load successful.");
      return;
    }
    if (i < retries) {
      console.log(`[Versioning] Retrying in ${delay / 1000} seconds...`);
      await Bun.sleep(delay);
    }
  }
  console.error("[Versioning] CRITICAL: Failed to load versions.json after all retries.");
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

      const s3Key = `assets/books/${bookSlug}/${currentVersion}/${assetPath}`;

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

    // Health check for verification
    if (reqPath === "/health") {
      return new Response(JSON.stringify({ status: "ok", time: new Date() }), { headers: { "Content-Type": "application/json" } });
    }

    console.log(`[Core API] Path "${reqPath}" did not match any routes. Returning 404.`);
    return new Response("Not Found", { status: 404 });
  },
});

console.log(`✅ Core API with Auth (Bun Native S3) is listening on port 3000`);
