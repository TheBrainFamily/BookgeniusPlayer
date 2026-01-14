import { defineApp } from "convex/server";
import assetManager from "./components/asset-manager/convex.config.js";

const app = defineApp();
app.use(assetManager);
export default app;
