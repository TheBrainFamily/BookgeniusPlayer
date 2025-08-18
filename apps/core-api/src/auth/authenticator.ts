// apps/core-api/src/auth/authenticator.ts

import { decodeJwt } from "jose";
import { verifyClerkToken } from "./clerk.strategy";
import type { AuthenticatedUser } from "../types";

/**
 * Extracts a token from the 'Authorization: Bearer <token>' header.
 */
function getTokenFromHeader(req: Request): string | null {
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }
  return null;
}

/**
 * Manually parses the Cookie header to find the '__session' cookie from Clerk.
 * This is simpler and more reliable in a proxied environment than using clerk.authenticateRequest.
 */
function getTokenFromCookie(req: Request): string | null {
  const cookieHeader = req.headers.get("Cookie");
  if (!cookieHeader) return null;

  // Find the specific cookie in the string
  const sessionCookie = cookieHeader.split(";").find((c) => c.trim().startsWith("__session="));

  if (sessionCookie) {
    // Return just the value of the cookie
    return sessionCookie.split("=")[1];
  }

  return null;
}

export async function authenticateRequest(req: Request): Promise<AuthenticatedUser> {
  // Priority 1: Check for an Authorization: Bearer header
  let token = getTokenFromHeader(req);

  // Priority 2: If no header, check for a session cookie
  if (!token) {
    token = getTokenFromCookie(req);
  }

  if (!token) {
    throw new Error("No token found in Authorization header or session cookie.");
  }

  // Now that we have a token string (from either source), we can inspect it
  // to decide which verification strategy to use.
  const payload = decodeJwt(token);
  const issuer = payload.iss;

  if (issuer?.includes("clerk")) {
    console.log("Authenticating with Clerk strategy...");
    return await verifyClerkToken(token);
  }

  throw new Error(`Unknown or unsupported token issuer: ${issuer}`);
}
