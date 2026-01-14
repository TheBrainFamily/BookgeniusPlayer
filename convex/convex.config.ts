import { defineApp } from "convex/server";
import versionedAssets from "convex-versioned-assets/convex.config.js";
const app = defineApp();
app.use(versionedAssets);
export default app;
