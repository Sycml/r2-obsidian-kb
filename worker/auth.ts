import type { Context, Next } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { AuthMode, Env } from "./types";

const SESSION_COOKIE_NAME = "r2_kb_session";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function resolveAuthMode(env: Env): AuthMode {
  const raw = (env.AUTH_MODE || "password").trim().toLowerCase();
  if (raw === "cloudflare-access" || raw === "none") {
    return raw;
  }
  return "password";
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(input: string): Uint8Array | null {
  try {
    const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function signHmac(secret: string, message: string): Promise<Uint8Array> {
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return new Uint8Array(sig);
}

async function deriveSessionSecret(env: Env): Promise<string> {
  if (env.SESSION_SECRET && env.SESSION_SECRET.trim().length >= 16) {
    return env.SESSION_SECRET.trim();
  }
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(`r2-obsidian-kb:v1:${env.ACCESS_PASSWORD || ""}`)
  );
  return toBase64Url(new Uint8Array(digest));
}

export async function verifyPassword(input: string, expected: string): Promise<boolean> {
  const compareKey = "r2-obsidian-kb-password-compare-v1";
  const [a, b] = await Promise.all([signHmac(compareKey, input), signHmac(compareKey, expected)]);
  return constantTimeEqual(a, b);
}

export async function createSessionToken(env: Env, ttlHours: number): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    v: 1,
    iat: now,
    exp: now + Math.max(1, ttlHours) * 3600,
  };
  const encodedPayload = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const secret = await deriveSessionSecret(env);
  const signature = toBase64Url(await signHmac(secret, encodedPayload));
  return `${encodedPayload}.${signature}`;
}

export async function verifySessionToken(env: Env, token: string): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [encodedPayload, encodedSig] = parts;
  if (!encodedPayload || !encodedSig) return false;

  const secret = await deriveSessionSecret(env);
  const expectedSig = await signHmac(secret, encodedPayload);
  const actualSig = fromBase64Url(encodedSig);
  if (!actualSig || !constantTimeEqual(actualSig, expectedSig)) {
    return false;
  }

  const payloadBytes = fromBase64Url(encodedPayload);
  if (!payloadBytes) return false;

  try {
    const payload = JSON.parse(decoder.decode(payloadBytes)) as { exp?: number; v?: number };
    const now = Math.floor(Date.now() / 1000);
    return payload.v === 1 && typeof payload.exp === "number" && payload.exp > now;
  } catch {
    return false;
  }
}

interface JwkKey extends JsonWebKey {
  kid?: string;
}

const jwksCache = new Map<string, { keys: JwkKey[]; expiresAt: number }>();

async function getCloudflareAccessJwks(teamDomain: string): Promise<JwkKey[]> {
  const normalizedDomain = teamDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const cached = jwksCache.get(normalizedDomain);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.keys;
  }

  const res = await fetch(`https://${normalizedDomain}/cdn-cgi/access/certs`);
  if (!res.ok) {
    throw new Error(`Failed to fetch Cloudflare Access JWKS: ${res.status}`);
  }
  const data = (await res.json()) as { keys?: JwkKey[] };
  const keys = data.keys || [];
  jwksCache.set(normalizedDomain, { keys, expiresAt: Date.now() + 10 * 60 * 1000 });
  return keys;
}

async function verifyCloudflareAccessJwt(
  token: string,
  teamDomain: string,
  expectedAud: string
): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [encodedHeader, encodedPayload, encodedSig] = parts;

  const headerBytes = fromBase64Url(encodedHeader);
  const payloadBytes = fromBase64Url(encodedPayload);
  const sigBytes = fromBase64Url(encodedSig);
  if (!headerBytes || !payloadBytes || !sigBytes) return false;

  try {
    const header = JSON.parse(decoder.decode(headerBytes)) as { alg?: string; kid?: string };
    const payload = JSON.parse(decoder.decode(payloadBytes)) as {
      aud?: string | string[];
      exp?: number;
    };

    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== "number" || payload.exp <= now) return false;

    const audList = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
    if (!audList.includes(expectedAud)) return false;
    if (header.alg !== "RS256" || !header.kid) return false;

    const keys = await getCloudflareAccessJwks(teamDomain);
    const jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) return false;

    const cryptoKey = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );

    return crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      sigBytes,
      encoder.encode(`${encodedHeader}.${encodedPayload}`)
    );
  } catch {
    return false;
  }
}

export async function isAuthenticated(c: Context<{ Bindings: Env }>): Promise<{
  authenticated: boolean;
  misconfigured?: boolean;
  reason?: string;
}> {
  const mode = resolveAuthMode(c.env);

  if (mode === "none") {
    return { authenticated: true };
  }

  if (mode === "cloudflare-access") {
    const jwt =
      c.req.header("Cf-Access-Jwt-Assertion") || getCookie(c, "CF_Authorization") || "";
    if (!jwt) {
      return { authenticated: false, reason: "Missing Cloudflare Access assertion" };
    }
    const teamDomain = (c.env.CF_ACCESS_TEAM_DOMAIN || "").trim();
    const aud = (c.env.CF_ACCESS_AUD || "").trim();
    if (teamDomain && aud) {
      const valid = await verifyCloudflareAccessJwt(jwt, teamDomain, aud);
      return valid
        ? { authenticated: true }
        : { authenticated: false, reason: "Invalid Cloudflare Access JWT" };
    }
    return { authenticated: true };
  }

  // Default: password mode (fail-closed if ACCESS_PASSWORD is not configured)
  if (!c.env.ACCESS_PASSWORD || c.env.ACCESS_PASSWORD.trim().length === 0) {
    return {
      authenticated: false,
      misconfigured: true,
      reason: "ACCESS_PASSWORD secret is not configured",
    };
  }

  const token = getCookie(c, SESSION_COOKIE_NAME);
  if (!token) {
    return { authenticated: false };
  }
  const valid = await verifySessionToken(c.env, token);
  return { authenticated: valid };
}

export async function authMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const status = await isAuthenticated(c);
  if (status.misconfigured) {
    return c.json(
      {
        error: "服务端尚未配置访问口令（ACCESS_PASSWORD），请先通过 wrangler secret put ACCESS_PASSWORD 完成配置。",
        code: "MISCONFIGURED",
      },
      503
    );
  }
  if (!status.authenticated) {
    return c.json({ error: "未授权访问，请先登录。", code: "UNAUTHORIZED" }, 401);
  }
  await next();
}

export function setSessionCookie(c: Context<{ Bindings: Env }>, token: string, ttlHours: number) {
  const isHttps = new URL(c.req.url).protocol === "https:";
  setCookie(c, SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isHttps,
    sameSite: "Lax",
    path: "/",
    maxAge: Math.max(1, ttlHours) * 3600,
  });
}

export function clearSessionCookie(c: Context<{ Bindings: Env }>) {
  const isHttps = new URL(c.req.url).protocol === "https:";
  deleteCookie(c, SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: isHttps,
    sameSite: "Lax",
    path: "/",
  });
}

export function getSessionTtlHours(env: Env): number {
  const parsed = Number.parseInt(env.SESSION_TTL_HOURS || "168", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 168;
  return Math.min(parsed, 24 * 365);
}
