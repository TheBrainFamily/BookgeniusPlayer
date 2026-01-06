import { type HttpRouter, type FunctionReference } from "convex/server";
import { httpActionGeneric } from "convex/server";
import { parseVersionIdFromPath } from "./helpers/parseVersionIdFromPath";

type AssetManagerComponent = {
  assetFsHttp: {
    getVersionForServing: FunctionReference<
      "query",
      "internal",
      { versionId: string },
      | null
      | { kind: "blob"; storageId: string; contentType?: string; cacheControl?: string }
      | { kind: "redirect"; location: string; cacheControl?: string }
    >;
    getBlobForServing: FunctionReference<
      "action",
      "internal",
      { storageId: string },
      ArrayBuffer | null
    >;
  };
};

// CORS headers for cross-origin requests (e.g., fetching XML in ChapterEditor)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const registerAssetFsRoutes = (
  http: HttpRouter,
  component: AssetManagerComponent,
  options?: { basePath?: string },
): void => {
  const basePath = options?.basePath ?? "/am/file";

  // Handle CORS preflight requests
  http.route({
    method: "OPTIONS",
    pathPrefix: `${basePath}/v/`,
    handler: httpActionGeneric(async () => {
      return new Response(null, { status: 204, headers: corsHeaders });
    }),
  });

  http.route({
    method: "GET",
    pathPrefix: `${basePath}/v/`,
    handler: httpActionGeneric(async (ctx, req) => {
      const { pathname } = new URL(req.url);
      const versionId = parseVersionIdFromPath(pathname, basePath);

      if (!versionId) {
        return new Response("Missing versionId", { status: 400, headers: corsHeaders });
      }

      const result = await ctx.runQuery(component.assetFsHttp.getVersionForServing, { versionId });

      console.log("[registerAssetFsRoutes] result:", result);
      if (!result) {
        return new Response("Not found", { status: 404, headers: corsHeaders });
      }

      if (result.kind === "blob") {
        // Call the component's action to get the blob from component storage.
        // HTTP actions can only access main app storage, not component storage,
        // so we need to use an action inside the component to fetch the blob.
        const arrayBuffer = await ctx.runAction(component.assetFsHttp.getBlobForServing, {
          storageId: result.storageId,
        });

        if (!arrayBuffer) {
          return new Response("Not found", { status: 404, headers: corsHeaders });
        }

        const headers = new Headers(corsHeaders);
        if (result.contentType) {
          headers.set("Content-Type", result.contentType);
        }
        if (result.cacheControl) {
          headers.set("Cache-Control", result.cacheControl);
        }

        return new Response(arrayBuffer, { status: 200, headers });
      }

      // redirect - include CORS headers
      const headers = new Headers({ ...corsHeaders, Location: result.location });
      if (result.cacheControl) {
        headers.set("Cache-Control", result.cacheControl);
      }

      return new Response(null, { status: 302, headers });
    }),
  });
};
