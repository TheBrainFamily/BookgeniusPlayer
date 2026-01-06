/**
 * Parse versionId from a file serving URL.
 *
 * Expected URL format: `{basePath}/v/{versionId}/{filename}`
 * Example: `/am/file/v/k57abc123.../intro.mp3`
 *
 * @param pathname - The URL pathname (e.g., "/am/file/v/abc123/file.txt")
 * @param basePath - The base path prefix (e.g., "/am/file")
 * @returns The versionId string, or null if not found
 */
export function parseVersionIdFromPath(pathname: string, basePath: string): string | null {
  // Remove leading/trailing slashes and split both paths
  const baseSegments = basePath.split("/").filter(Boolean);
  const pathSegments = pathname.split("/").filter(Boolean);

  // Expected structure: [...baseSegments, 'v', versionId, filename...]
  // versionId is at position: baseSegments.length + 1
  const versionIdIndex = baseSegments.length + 1;

  // Verify the path starts with basePath and has '/v/' marker
  const vMarkerIndex = baseSegments.length;
  if (pathSegments[vMarkerIndex] !== "v") {
    return null;
  }

  const versionId = pathSegments[versionIdIndex];
  return versionId || null;
}
