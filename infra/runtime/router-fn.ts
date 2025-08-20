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
  const uri: string = req.uri || "/";

  // 🔒 Do not rewrite API calls — let CF path behavior route them to API Gateway
  if (uri.startsWith("/api/")) {
    // preserve viewer host for branch detection downstream
    req.headers = req.headers || {};
    req.headers["x-viewer-host"] = { value: host };
    // strip prefix for the origin
    req.uri = uri.replace(/^\/api/, "") || "/";
    return req;
  }

  const qsVal = (k: string) => (qs[k] && qs[k].value) || undefined;
  const norm = (u: string) => (!u || u === "" ? "/" : u.charAt(0) === "/" ? u : `/${u}`);
  const hasExt = /\.[A-Za-z0-9]{1,8}(\?|$)/.test(uri);

  // subdomain detection
  const parts = host.split(".");
  const sub = parts.length > 2 ? parts[0] : ""; // <branch>.branches.example.com -> <branch>
  const second = parts.length > 3 ? parts[1] : ""; // <branch>.branches.example.com -> "branches"
  const isBranchesDomain = second === "branches";

  // Branch is any sub on *.branches.<apex>
  const branch = isBranchesDomain && sub ? sub : "";

  // SEO redirect only on apex (not on branches.*)
  const reserved: Record<string, true> = { www: true, api: true, cdn: true, branches: true };
  const isBookSlugSub = !isBranchesDomain && !!sub && !reserved[sub];
  if (isBookSlugSub) {
    const apex = host.replace(new RegExp(`^${sub}\\.`), "");
    return { statusCode: 301, statusDescription: "Moved Permanently", headers: { location: { value: `https://${apex}/player/?book=${encodeURIComponent(sub)}` } }, cookies: {} };
  }

  // keep your existing bases EXACTLY the same:
  const platformBase = branch ? `/app/platform/branches/${branch}` : "/app/platform/prod";

  const playerCtx = qsVal("playerctx");
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
