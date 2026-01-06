/**
 * Get the Convex site URL from the Convex deployment URL.
 * Converts .cloud to .site for HTTP routes.
 */
function getConvexSiteUrl(): string | undefined {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

  if (!convexUrl) return undefined;

  // Convert https://foo.convex.cloud to https://foo.convex.site
  return convexUrl.replace(/\.cloud$/, ".site");
}

/**
 * Build a URL for a specific file version.
 */
export function getVersionUrl(options: {
  versionId: string;
  basename?: string;
  basePath?: string;
}): string {
  const { versionId } = options;
  const basename = options.basename ?? "file";

  const envBase = process.env.NEXT_PUBLIC_ASSET_BASE_PATH;
  const encodedName = encodeURIComponent(basename);

  // If a custom base path is provided (e.g. "/cdn" for Vercel), use relative URL
  if (options.basePath || envBase) {
    const basePath = options.basePath ?? envBase;
    const trimmedBase = basePath!.replace(/\/+$/, "");
    return `${trimmedBase}/${versionId}/${encodedName}`;
  }

  // Otherwise, use absolute URL to Convex site
  const siteUrl = getConvexSiteUrl();

  if (siteUrl) {
    return `${siteUrl}/am/file/v/${versionId}/${encodedName}`;
  }

  // Fallback to relative path
  return `/am/file/v/${versionId}/${encodedName}`;
}
