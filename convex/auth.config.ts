import { type AuthConfig } from "convex/server";

if (!process.env.CLERK_JWT_ISSUER_DOMAIN_INTL || !process.env.CLERK_JWT_ISSUER_DOMAIN_PL) {
  throw new Error("Missing required CLERK_JWT_ISSUER_DOMAIN environment variables");
}

export default {
  providers: [
    // Clerk auth - production
    { domain: process.env.CLERK_JWT_ISSUER_DOMAIN_INTL, applicationID: "convex" },
    { domain: process.env.CLERK_JWT_ISSUER_DOMAIN_PL, applicationID: "convex" },
    // Clerk auth - development (for local CMS)
    ...(process.env.CLERK_JWT_ISSUER_DOMAIN_DEV
      ? [{ domain: process.env.CLERK_JWT_ISSUER_DOMAIN_DEV, applicationID: "convex" }]
      : []),
  ],
} satisfies AuthConfig;
