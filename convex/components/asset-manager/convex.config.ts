import { defineComponent } from "convex/server";
import r2 from "@convex-dev/r2/convex.config.js";

const component = defineComponent("assetManager");
component.use(r2);
export default component;
