import { httpRouter } from "convex/server";
import { components } from "./_generated/api";
import { registerAssetFsRoutes } from "convex-versioned-assets";
import { uploadBackgroundPreview } from "./backgroundPreviewHttp";

const http = httpRouter();

// Asset file serving routes
registerAssetFsRoutes(http, components.versionedAssets);

// Background preview webhook (receives MP4 + WebP from FFmpeg worker)
http.route({
  path: "/upload-background-preview",
  method: "POST",
  handler: uploadBackgroundPreview,
});

export default http;
