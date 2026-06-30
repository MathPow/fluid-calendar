// SSO UltraTales : vérifie le cookie `ut_session` (JWT Ed25519) émis par
// accounts.ultratales.com via sa clé publique (JWKS). Edge-safe (jose) → utilisable
// dans le middleware ET les routes API. Additif : ne touche pas à NextAuth.
import { createRemoteJWKSet, jwtVerify } from "jose";

const ISSUER = process.env.UT_ISSUER || "https://accounts.ultratales.com";
const JWKS = createRemoteJWKSet(
  new URL(process.env.UT_JWKS_URL || `${ISSUER}/.well-known/jwks.json`)
);

export type UtClaims = { sub: string; email: string; name: string };

export async function verifyUtSession(
  token?: string | null
): Promise<UtClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWKS, { issuer: ISSUER });
    return {
      sub: String(payload.sub),
      email: String(payload.email ?? ""),
      name: String(payload.name ?? ""),
    };
  } catch {
    return null;
  }
}
