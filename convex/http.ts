import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { components } from "./_generated/api";
import { registerAssetFsRoutes } from "./components/asset-manager/registerAssetFsRoutes";

const http = httpRouter();

auth.addHttpRoutes(http);
registerAssetFsRoutes(http, components.assetManager);

export default http;
