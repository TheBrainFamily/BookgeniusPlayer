export function base64urlEncode(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  const b64 = btoa(binary);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64urlDecode(s: string): Uint8Array {
  // convert to standard base64
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 2 ? "==" : b64.length % 4 === 3 ? "=" : "";
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function utf8Encode(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

export function utf8Decode(buf: ArrayBuffer | Uint8Array): string {
  return new TextDecoder().decode(buf instanceof Uint8Array ? buf : new Uint8Array(buf));
}

export interface JwtPayload {
  sub?: string;
  iss?: string;
  email?: string;
  exp?: number;
  nbf?: number;
  [key: string]: unknown;
}

async function importRsaPublicKey(pem: string): Promise<CryptoKey> {
  const clean = pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s+/g, "");
  const der = base64urlDecode(clean.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""));
  return crypto.subtle.importKey(
    "spki",
    der.buffer as ArrayBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

export async function verifyGenericToken(token: string, publicKeyPem: string): Promise<JwtPayload> {
  if (!publicKeyPem) throw new Error("JWT public key PEM missing");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT format");
  const [headerB64, payloadB64, sigB64] = parts;
  const header = JSON.parse(new TextDecoder().decode(base64urlDecode(headerB64)));
  if (header.alg !== "RS256") throw new Error("Unsupported alg; expected RS256");
  const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(payloadB64))) as JwtPayload;

  // Verify exp/nbf
  const now = Math.floor(Date.now() / 1000);
  if ((payload.exp && payload.exp < now) || (payload.nbf && payload.nbf > now)) {
    throw new Error("Token is expired or not yet valid");
  }

  const key = await importRsaPublicKey(publicKeyPem);
  const data = utf8Encode(`${headerB64}.${payloadB64}`);
  const sig = base64urlDecode(sigB64);
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    sig.buffer as ArrayBuffer,
    data.buffer as ArrayBuffer,
  );
  if (!ok) throw new Error("JWT signature invalid");
  return payload;
}
