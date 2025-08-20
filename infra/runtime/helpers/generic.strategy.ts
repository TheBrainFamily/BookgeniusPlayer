import jwt, { JwtPayload } from "jsonwebtoken";

export async function verifyGenericToken(token: string) {
  const publicKey = process.env.TOKEN_PUBLIC_KEY;
  if (!publicKey) {
    throw new Error("TOKEN_PUBLIC_KEY is not set");
  }
  try {
    const decoded = jwt.verify(token, publicKey) as JwtPayload;

    // Validate the token's expiration (exp) and not before (nbf) claims
    const currentTime = Math.floor(Date.now() / 1000);
    if (decoded?.exp && decoded?.nbf && (decoded.exp < currentTime || decoded.nbf > currentTime)) {
      throw new Error("Token is expired or not yet valid");
    }

    return decoded;
  } catch (error) {
    throw new Error(`Invalid token: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
