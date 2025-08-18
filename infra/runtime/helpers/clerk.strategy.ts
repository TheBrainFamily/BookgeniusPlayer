import { verifyToken } from "@clerk/backend";
import type { AuthenticatedUser } from "./types.ts";

export async function verifyClerkToken(token: string): Promise<AuthenticatedUser> {
  try {
    const verifiedToken = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY!,
      // Optional: Add authorized parties for CSRF protection
      // authorizedParties: ['http://localhost:3000', 'https://your-domain.com']
    });

    console.log("Clerk token verification result:", verifiedToken);

    if (!verifiedToken.sub) {
      throw new Error("Clerk token is missing 'sub' (user ID) claim.");
    }

    // Extract email from the JWT payload if available
    const email = verifiedToken.email || verifiedToken.primary_email_address_id || undefined;

    return { id: verifiedToken.sub, email: email as string | undefined, authProvider: "clerk" };
  } catch (error) {
    console.error("Clerk token verification failed:", error);
    throw new Error("Invalid Clerk token");
  }
}
