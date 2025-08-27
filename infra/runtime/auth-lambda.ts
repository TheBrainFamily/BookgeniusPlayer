import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { signGenericToken } from "./helpers/generic.strategy.js";

const {
  JWT_PRIVATE_KEY_PEM,
} = process.env;

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
  try {
    const path = normalizePath(event);
    if (path === "/login") {
      if (!JWT_PRIVATE_KEY_PEM) return res(500, { error: "missing_env_JWT_PRIVATE_KEY_PEM" });

      const token = await signGenericToken({}, JWT_PRIVATE_KEY_PEM); // <- pusty payload + klucz z env

      const cookie = buildCookie({
        name: "__session",
        value: encodeURIComponent(token),
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      });

      return redirect("/", [cookie]);
    }

    if (path === "/logout") {
      const cookie = buildCookie({
        name: "__session",
        value: "",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
        maxAge: 0,
        expires: new Date(0),
      });

      return redirect("/", [cookie]);
    }

    return res(404, { error: "not_found" });

  } catch (e) {
    console.error(e);
    return res(500, { error: "internal_error" });
  }
};

/* ================= Helpers ================= */

function normalizePath(event: APIGatewayProxyEventV2): string {
  const raw = event.rawPath || event.requestContext?.http?.path || "/";
  return raw.endsWith("/") && raw.length > 1 ? raw.slice(0, -1) : raw;
}

function redirect(location: string, cookies?: string[]): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode: 302,
    headers: {
      location,
      "cache-control": "no-store",
    },
    cookies,
  };
}

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

type CookieOpts = {
  name: string;
  value: string;
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Lax" | "Strict" | "None";
  domain?: string;
  maxAge?: number;    // in seconds
  expires?: Date;     // absolute date
};

function buildCookie(opts: CookieOpts): string {
  const parts = [`${opts.name}=${opts.value}`];
  if (opts.path) parts.push(`Path=${opts.path}`);
  if (opts.domain) parts.push(`Domain=${opts.domain}`);
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  if (typeof opts.maxAge === "number") parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.expires instanceof Date) parts.push(`Expires=${opts.expires.toUTCString()}`);
  return parts.join("; ");
}
