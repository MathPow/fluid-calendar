// Auto-login over the tailnet. The `dreamdash` Caddy node (tsnet +
// tailscale_auth) is the only way in on dreamdash.yoursecondmind.com; it
// replaces whatever the client sent with two headers:
//   X-Dreamdash-Proxy  the shared secret TAILNET_PROXY_SECRET
//   X-Tailscale-User   the Tailscale login of the device's owner
// Anything that reaches :3006 without going through Caddy (the Funnel hook,
// the ts.net:8444 serve, local crons) can't know the secret, so it gets the
// normal sign-in. Edge-safe: used by the middleware and the API route.

export const PROXY_HEADER = "x-dreamdash-proxy";
export const TAILSCALE_USER_HEADER = "x-tailscale-user";

/** Length-independent compare, fine for a secret that never leaves the host. */
function sameSecret(a: string, b: string): boolean {
  if (!a || !b) return false;
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** Auto-login is on only when the proxy secret AND the step-up PIN are set,
 * so a half-configured deploy never skips the login with nothing behind it. */
export function tailnetAutoLoginEnabled(): boolean {
  return !!process.env.TAILNET_PROXY_SECRET && !!process.env.STEPUP_PIN_HASH;
}

/** True when the request came through the Caddy tailnet node. */
export function fromTailnetProxy(headers: Headers): boolean {
  if (!tailnetAutoLoginEnabled()) return false;
  return sameSecret(
    headers.get(PROXY_HEADER) ?? "",
    process.env.TAILNET_PROXY_SECRET ?? ""
  );
}

/** The Tailscale login, if it's one of TAILNET_ALLOWED_LOGINS. */
export function allowedTailnetLogin(headers: Headers): string | null {
  const login = (headers.get(TAILSCALE_USER_HEADER) ?? "").trim().toLowerCase();
  if (!login) return null;
  const allowed = (process.env.TAILNET_ALLOWED_LOGINS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(login) ? login : null;
}
