import { s3 } from "bun";
import path from "path";
import { authenticateRequest } from './auth/authenticator';

console.log("🚀 Starting Core API with authentication and native S3 client...");

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

    if (reqPath.startsWith("/content/")) {
      // Authenticate the request first
      try {
        const user = await authenticateRequest(req);
        console.log(`✅ Authorized as user ${user.id} via ${user.authProvider}`);
      } catch (error) {
        console.error("⛔️ Authorization failed:", error.message);
        return new Response("Unauthorized", { status: 401 });
      }

      const s3Key = reqPath.substring("/content/".length);
      console.log(`[Core API] Request matches /content/. Requesting S3 Key: ${s3Key}`);
      
      try {
        const s3File = s3.file(s3Key);
        if (!(await s3File.exists())) {
          console.error(`[Core API] File not found in S3: ${s3Key}`);
          return new Response("Not Found", { status: 404 });
        }

        // Determine the correct MIME type for the response
        const mimeType = getMimeType(s3Key);
        console.log(`[Core API] Serving file ${s3Key} with MIME type ${mimeType}`);

        return new Response(s3File.stream(), {
          headers: {
            // Use our intelligently determined MIME type
            "Content-Type": mimeType,
            "Content-Length": s3File.size.toString(),
          },
        });
      } catch (error) {
        console.error("[Core API] Error during S3 operation:", error);
        return new Response("Internal Server Error", { status: 500 });
      }
    }
    
    // Health check for verification
    if (reqPath === "/health") {
      return new Response(JSON.stringify({ status: "ok", time: new Date() }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log(`[Core API] Path "${reqPath}" did not match any routes. Returning 404.`);
    return new Response("Not Found", { status: 404 });
  },
});

console.log(`✅ Core API with Auth (Bun Native S3) is listening on port 3000`);