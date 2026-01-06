import fs from "fs";
import { generateToken } from "./token";
import { getCookie } from "./getCookie";
import { verifyGenericToken } from "./generic.strategy";

function readPem(filename: string): string | undefined {
  try {
    return fs.readFileSync(new URL(filename, import.meta.url), "utf8");
  } catch (error) {
    console.error(`Failed to read ${filename}`, error);
    return undefined;
  }
}

const defaultJwtKey = readPem("jwt-public-key.pem");
const snapplifyJwtKey = readPem("snapplify-jwt-public-key.pem");

export async function handleGenerateRealtimeToken(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  let isLoggedIn = false;
  try {
    const authHeader = req.headers.get("authorization");
    const bearer = authHeader && /^Bearer\s+(.+)$/.exec(authHeader)?.[1];
    const cookieHeader = req.headers.get("cookie");
    const cookieToken = getCookie(cookieHeader || "", "__session");
    const qsToken = new URL(req.url).searchParams.get("token") || undefined;
    const providedToken = bearer || cookieToken || qsToken || undefined;
    if (providedToken) {
      const viewerHostHeader = (
        req.headers.get("x-viewer-host") ||
        req.headers.get("host") ||
        ""
      ).toLowerCase();
      const viewerHost = viewerHostHeader.split(":")[0];
      let jwtKey = defaultJwtKey;
      if (
        snapplifyJwtKey &&
        (viewerHost.endsWith(".snapplify.com") || viewerHost === "bookgenius.snapplify.com")
      ) {
        jwtKey = snapplifyJwtKey;
      }
      if (!jwtKey) {
        throw new Error("JWT public key not configured");
      }
      await verifyGenericToken(providedToken, jwtKey);
      isLoggedIn = true;
    }
  } catch (e) {
    console.error("Error verifying token", e);
    isLoggedIn = false;
  }

  if (isLoggedIn || process.env.NODE_ENV === "dev") {
    let token: string | undefined;
    try {
      token = await generateToken();
    } catch (e) {
      console.error("Failed to create ephemeral token", e);
      return new Response("Failed to create ephemeral token", {
        status: 500,
        headers: corsHeaders,
      });
    }
    return new Response(token, { status: 200, headers: corsHeaders });
  } else {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }
}
