import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import * as crypto from "crypto";
import type { StreamingBlobPayloadOutputTypes, SdkStreamMixin } from "@smithy/types";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
// import { verifyClerkToken } from "./helpers/clerk.strategy.js";
import { verifyGenericToken } from "./helpers/generic.strategy.js";

const {
  BUCKET,
  DEFAULT_CTX = "prod",
  VERSIONS_ROOT = "branches",
  CDN_DOMAIN,
  TOKEN_TTL_SECONDS = "21600",
  CF_PRIVATE_KEY_PEM,
  CF_PUBLIC_KEY_ID,
  BUCKET_REGION = "us-east-1",
} = process.env;

const s3 = new S3Client({ region: BUCKET_REGION });
function hostToBranch(host?: string): string | undefined {
  if (!host) return;
  const h = host.split(":")[0];
  const first = h.split(".")[0];
  if (/^pr-/.test(first)) return first;
}

function getCookieFromEventV2(event: APIGatewayProxyEventV2, name: string): string | null {
  // HTTP API v2 passes cookies in event.cookies (array of "name=value")
  if (Array.isArray(event.cookies) && event.cookies.length) {
    const hit = event.cookies.find((c) => c.startsWith(name + "="));
    if (hit) return hit.substring(name.length + 1);
  }
  // fallback to header parsing if API ever sends Cookie header
  return getCookie(event.headers, name);
}

async function getVersions(ctx: string): Promise<Record<string, string> | null> {
  try {
    const out = await s3.send(new GetObjectCommand({ Bucket: BUCKET!, Key: `${ctx}/versions.json` }));
    if (!out.Body) return null;

    // Body in AWS SDK v3 has the SdkStreamMixin at runtime; cast to use it in TS:
    const body = out.Body as StreamingBlobPayloadOutputTypes & SdkStreamMixin;

    // Preferred: works in Lambda Node 18/20, browser, etc.
    const txt = await body.transformToString("utf-8");

    return JSON.parse(txt);
  } catch {
    return null;
  }
}

function buildPolicy(prefixUrl: string, expires: number) {
  return { Statement: [{ Resource: `${prefixUrl}*`, Condition: { DateLessThan: { "AWS:EpochTime": expires } } }] };
}
function b64url(s: string) {
  return Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/=/g, "_").replace(/\//g, "~");
}
function signPolicy(policyJson: string, privateKeyPem: string) {
  const signer = crypto.createSign("RSA-SHA1"); // CloudFront signed URL uses RSA-SHA1
  signer.update(policyJson);
  return signer.sign(privateKeyPem, "base64").replace(/\+/g, "-").replace(/=/g, "_").replace(/\//g, "~");
}

// --- minimal Clerk auth helpers (header first, then __session cookie) ---
function getBearerFromHeaderV2(headers: Record<string, string | undefined> | undefined): string | null {
  if (!headers) return null;
  const h = headers.authorization || headers.Authorization;
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/.exec(h);
  return m ? m[1] : null;
}
function getCookie(headers: Record<string, string | undefined> | undefined, name: string): string | null {
  const raw = headers?.cookie || headers?.Cookie;
  if (!raw) return null;
  const hit = raw
    .split(";")
    .map((s) => s.trim())
    .find((x) => x.startsWith(name + "="));
  return hit ? hit.substring(name.length + 1) : null;
}

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
  try {
    const slugParam =
      event.pathParameters?.slug ??
      (() => {
        const p = (event as any).rawPath || (event as any).requestContext?.http?.path || "";
        const m = /\/content\/resolve\/([^\/\?#]+)/.exec(p);
        return m ? m[1] : undefined;
      })();
    if (!slugParam) return res(400, { error: "slug required" });
    const slug = decodeURIComponent(slugParam);

    const ctxFromQuery = event.queryStringParameters?.ctx;
    let ctx = ctxFromQuery;

    if (!ctx) {
      const host = event.headers?.["x-viewer-host"] || event.requestContext.domainName || event.headers?.host;
      const branch = hostToBranch(host);
      ctx = branch ? `${VERSIONS_ROOT}/${branch}` : DEFAULT_CTX;
    }

    // --- verify Clerk token (Authorization: Bearer OR __session cookie) ---
    let isLoggedIn = false;
    try {
      const headerToken = getBearerFromHeaderV2(event.headers);
      const cookieToken = getCookieFromEventV2(event, "__session");
      const queryStringToken = event.queryStringParameters?.token;
      const token = headerToken || cookieToken || queryStringToken;
      if (token) {
        await verifyGenericToken(token);
        // await verifyClerkToken(token);
        isLoggedIn = true;
      }
    } catch {
      isLoggedIn = false;
    }
    const visibility = isLoggedIn ? "full" : "demo";

    let versions = await getVersions(ctx!);
    let ctxUsed = ctx!;
    if (!versions) {
      versions = await getVersions(DEFAULT_CTX);
      ctxUsed = DEFAULT_CTX;
    }
    if (!versions) return res(503, { error: "versions_unavailable" });

    const version = versions[slug];
    if (!version) return res(404, { error: "version_not_found" });

    const baseFolder = visibility === "demo" ? `/${ctxUsed}/assets/books/${slug}-demo/${version}/` : `/${ctxUsed}/assets/books/${slug}/${version}/`;

    const expires = Math.floor(Date.now() / 1000) + parseInt(TOKEN_TTL_SECONDS!, 10);
    const prefixUrl = `https://${CDN_DOMAIN}${baseFolder}`.replace(/\/+$/, "/");

    // get private key
    const privateKeyPem = CF_PRIVATE_KEY_PEM;
    if (!privateKeyPem) {
      console.error("CF_PRIVATE_KEY_PEM not set");
      return res(500, { error: "signing_key_missing" });
    }

    const policyJson = JSON.stringify(buildPolicy(prefixUrl, expires));
    const policyB64 = b64url(policyJson);
    const signature = signPolicy(policyJson, privateKeyPem);

    if (!CF_PUBLIC_KEY_ID) {
      console.error("CF_PUBLIC_KEY_ID not set");
      return res(500, { error: "signing_key_missing" });
    }

    const assetPrefix = prefixUrl.replace(/\/+$/, "");
    const assetQuery = `Policy=${policyB64}&Signature=${signature}&Key-Pair-Id=${encodeURIComponent(CF_PUBLIC_KEY_ID!)}`;
    // Note: we do NOT include Key-Pair-Id here; for KeyGroup keys you don't need Key-Pair-Id param.
    // If you prefer explicit param, add a separate env for PublicKeyId and include it.

    const preload = [`${assetPrefix}/compiled/bookData.js?${assetQuery}`];

    return res(200, { slug, version, visibility, ctxUsed, assetPrefix, assetQuery, preload });
  } catch (e) {
    console.error(e);
    return res(500, { error: "internal_error" });
  }
};

function res(statusCode: number, body: Record<string, unknown>): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "private, no-store, no-cache, must-revalidate",
      pragma: "no-cache",
      expires: "0",
      vary: "Authorization",
    },
    body: JSON.stringify(body),
  };
}
