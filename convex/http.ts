import { httpRouter } from "convex/server";
import { components } from "./_generated/api";
import { registerAssetFsRoutes } from "./components/asset-manager/registerAssetFsRoutes";
import { uploadBackgroundPreview } from "./backgroundPreviewHttp";

const http = httpRouter();

// Asset file serving routes
registerAssetFsRoutes(http, components.assetManager);

// Background preview webhook (receives MP4 + WebP from FFmpeg worker)
http.route({
  path: "/upload-background-preview",
  method: "POST",
  handler: uploadBackgroundPreview,
});

export default http;
