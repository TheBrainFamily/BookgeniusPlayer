/**
 * Get R2 config from env vars. Returns undefined if not configured.
 * Called once per request, passed to component functions.
 *
 * R2_PUBLIC_URL is required and stored with each file version at upload time,
 * enabling URL changes without breaking existing file links.
 */
export function getR2Config() {
  if (!process.env.R2_BUCKET) return undefined;
  return {
    R2_BUCKET: process.env.R2_BUCKET,
    R2_ENDPOINT: process.env.R2_ENDPOINT!,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID!,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY!,
    R2_PUBLIC_URL: process.env.R2_PUBLIC_URL!,
    R2_KEY_PREFIX: process.env.R2_KEY_PREFIX,
  };
}
