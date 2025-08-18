// CloudFront Function (runtime: JS_2_0). No imports/exports.
// Must define global function `handler(event)` and return a request/response.
// Uses modern TS/JS, compiled to plain JS (no module wrapper).

// Type-only import - gets completely stripped during TypeScript compilation
// Inlined CloudFront Functions types (no imports needed)
interface CloudFrontRequest {
  uri: string;
  method: string;
  querystring?: Record<string, { value: string }>;
  headers?: Record<string, { value: string }>;
  cookies?: Record<string, { value: string }>;
}

interface CloudFrontResponse {
  statusCode: number;
  statusDescription?: string;
  headers?: Record<string, { value: string }>;
  cookies?: Record<string, { value: string }>;
}

interface CloudFrontFunctionsEvent {
  request: CloudFrontRequest;
  response?: CloudFrontResponse;
}

// Return type can be either the modified request or a response object
type CloudFrontFunctionsResult = CloudFrontRequest | CloudFrontResponse;

function handler(event: CloudFrontFunctionsEvent): CloudFrontFunctionsResult {
  const req = event.request;
  const host: string = (req.headers && req.headers.host && req.headers.host.value) || "";
  const qs: Record<string, { value: string }> = req.querystring || {};
  let uri: string = req.uri || "/";

  // 🔒 Do not rewrite API calls — let CF path behavior route them to API Gateway
  if (uri.startsWith("/api/")) {
    // remove '/api' prefix so origin receives '/content/resolve/...' instead of '/api/content/...'
    req.uri = uri.replace(/^\/api/, "") || "/";
    return req;
  }

  const qsVal = (k: string) => (qs[k] && qs[k].value) || undefined;
  const norm = (u: string) => (!u || u === "" ? "/" : u.charAt(0) === "/" ? u : `/${u}`);
  const hasExt = /\.[A-Za-z0-9]{1,8}(\?|$)/.test(uri);

  // subdomain detection
  const parts = host.split(".");
  const sub = parts.length > 2 ? parts[0] : ""; // e.g. pr-394.example.com -> pr-394
  const reserved: Record<string, true> = { www: true, api: true, cdn: true };
  const isBranch = /^pr-/.test(sub);
  const isBookSlugSub = !!sub && !reserved[sub] && !isBranch;

  // SEO entry: <slug>.<apex> -> 301 to apex /player/?book=<slug>
  if (isBookSlugSub) {
    const apex = host.replace(new RegExp(`^${sub}\\.`), "");
    return { statusCode: 301, statusDescription: "Moved Permanently", headers: { location: { value: `https://${apex}/player/?book=${encodeURIComponent(sub)}` } }, cookies: {} };
  }

  // Choose platform base (prod or branch)
  const branch = isBranch ? sub : "";
  const platformBase = branch ? `/app/platform/branches/${branch}` : "/app/platform/prod";

  // Choose player build base
  const playerCtx = qsVal("playerctx"); // ex: "branches/pr-394" or "prod"
  let playerBase: string;
  if (playerCtx && /^branches\//.test(playerCtx)) {
    playerBase = `/app/player/${playerCtx}`;
  } else if (branch) {
    playerBase = `/app/player/branches/${branch}`;
  } else {
    playerBase = "/app/player/prod";
  }

  // Route /player|/reader vs everything else
  const isPlayer = /^\/(player|reader)(\/|$)/.test(uri);
  let tail = isPlayer ? uri.replace(/^\/(player|reader)/, "") : uri;
  tail = norm(tail);

  if (isPlayer) {
    req.uri = !hasExt || tail === "/" ? `${playerBase}/index.html` : `${playerBase}${tail}`;
  } else {
    req.uri = !hasExt || uri === "/" ? `${platformBase}/index.html` : `${platformBase}${uri}`;
  }
  return req;
}
