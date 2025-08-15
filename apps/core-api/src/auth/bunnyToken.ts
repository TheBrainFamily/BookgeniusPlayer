// Add near top of file
import crypto from "crypto";

export const BUNNY_TOKEN_KEY = process.env.CORE_BUNNY_TOKEN_KEY || ""; // set this in your env
if (!BUNNY_TOKEN_KEY) {
  console.warn("⚠️ CORE_BUNNY_TOKEN_KEY is not set — token auth will not work until you set it.");
}

/**
 * Generate Bunny token v2 (SHA256 raw -> base64url).
 * - tokenKey: Bunny Token Authentication secret from the Pull Zone UI.
 * - urlPath: the request path used for signing. MUST start with '/' and match the path you will protect.
 * - tokenPath: optional. If provided, token will be valid for that folder (recommended).
 * - expiresInSec: seconds from now; e.g. 6*3600
 *
 * Returns: { token, expires } where token is base64url string.
 */
export function generateBunnyToken(tokenKey: string, urlPath: string, tokenPath: string | null = null, expiresInSec = 6 * 3600) {
  const expires = Math.floor(Date.now() / 1000) + expiresInSec;

  // Build the "encoded query parameters" part (form-encoded, sorted ascending by key).
  // For our simple use-case we only add token_path if present.
  let encodedQueryParams = "";
  if (tokenPath) {
    // param names must be not encoded in the encoded-query-params string, only values are raw.
    // The docs say: "param1=something&param2=something" (not URL encoded as a whole).
    // token_path value should be the raw path (not percent-encoded) here.
    encodedQueryParams = `token_path=${tokenPath}`;
  }

  //
  // Build hash input exactly as Bunny docs: token_key + signed_url + expires + (optional remote_ip) + (optional encoded_query_parameters)
  // We are NOT including remote_ip (unless you enable IP binding).
  //
  const hashInput = tokenKey + urlPath + String(expires) + (encodedQueryParams ? encodedQueryParams : "");

  // Raw SHA256 bytes
  const raw = crypto.createHash("sha256").update(hashInput).digest();

  // base64url encode (replace +/ and strip =)
  const token = raw.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "").replace(/\n/g, "");

  return { token, expires };
}
