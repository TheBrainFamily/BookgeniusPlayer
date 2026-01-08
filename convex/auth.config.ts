import { type AuthConfig } from "convex/server";

export default {
  providers: [
    { domain: process.env.CLERK_JWT_ISSUER_DOMAIN_INTL!, applicationID: "convex" },
    { domain: process.env.CLERK_JWT_ISSUER_DOMAIN_PL!, applicationID: "convex" },
  ],
} satisfies AuthConfig;
