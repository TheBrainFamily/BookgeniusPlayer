// pino-setup.ts
// @ts-expect-error(this works, types not important here)
import pino from "pino";
import os from "os"; // Make sure 'os' is imported
import { als } from "./als-context"; // Import your ALS instance

const pinoJsonLogger = pino({
  level: "debug",
  base: { pid: process.pid, hostname: os.hostname(), application: "add-pages-metadata" },
  mixin() {
    return als.getStore() || {};
  },
});

export { pinoJsonLogger };
