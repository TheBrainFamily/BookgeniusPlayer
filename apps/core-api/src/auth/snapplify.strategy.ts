import { jwtVerify, createRemoteJWKSet } from 'jose';
import type { AuthenticatedUser, JWTPayload } from "../types";

// JWKS endpoint URL - will be provided by Snapplify
const SNAPPLIFY_JWKS_URL = process.env.SNAPPLIFY_JWKS_URL || 'https://auth.snapplify.com/.well-known/jwks.json';

// Create JWKS client for fetching public keys
const JWKS = createRemoteJWKSet(new URL(SNAPPLIFY_JWKS_URL));

export async function verifySnapplifyToken(token: string): Promise<AuthenticatedUser> {
  try {
    // Verify the token using RS256 algorithm and JWKS endpoint
    const { payload } = await jwtVerify(token, JWKS, {
      algorithms: ['RS256'],
      issuer: process.env.SNAPPLIFY_ISSUER || 'https://snapplify.com',
    });

    const typedPayload = payload as JWTPayload;

    if (!typedPayload.sub) {
      throw new Error("Snapplify token is missing 'sub' (user ID) claim.");
    }

    return {
      id: typedPayload.sub,
      email: typedPayload.email,
      authProvider: 'snapplify',
    };
  } catch (error) {
    console.error("Snapplify token verification failed:", error);
    throw new Error("Invalid Snapplify token");
  }
}