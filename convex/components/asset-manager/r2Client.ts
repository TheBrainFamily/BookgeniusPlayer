import { R2 } from "@convex-dev/r2";
import { components } from "./_generated/api";

/**
 * R2 configuration passed from the app layer (where env vars are accessible).
 * Components are isolated and can't read process.env, so config must be passed in.
 */
export interface R2Config {
  R2_BUCKET: string;
  R2_ENDPOINT: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
}

/**
 * R2 client factory for the asset-manager component.
 * Config must be passed from the app layer since components can't access env vars.
 */
export function createR2Client(config: R2Config): R2 {
  return new R2(components.r2, config);
}
