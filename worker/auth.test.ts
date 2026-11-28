import { describe, expect, it } from "vitest";
import app from "./index";
import {
  createSessionToken,
  resolveAuthMode,
  verifyPassword,
  verifySessionToken,
} from "./auth";
import type { Env } from "./types";

const mockEnv = {
  ACCESS_PASSWORD: "super-secret-password",
  SESSION_SECRET: "a-very-long-random-session-secret-key-123456",
} as unknown as Env;

describe("worker/auth utilities", () => {
  it("resolves auth modes with safe password default", () => {
    expect(resolveAuthMode({} as Env)).toBe("password");
    expect(resolveAuthMode({ AUTH_MODE: "cloudflare-access" } as Env)).toBe("cloudflare-access");
    expect(resolveAuthMode({ AUTH_MODE: "none" } as Env)).toBe("none");
    expect(resolveAuthMode({ AUTH_MODE: "unknown" } as Env)).toBe("password");
  });

  it("verifies passwords accurately", async () => {
    expect(await verifyPassword("super-secret-password", "super-secret-password")).toBe(true);
    expect(await verifyPassword("wrong", "super-secret-password")).toBe(false);
    expect(await verifyPassword("super-secret-password ", "super-secret-password")).toBe(false);
  });

  it("signs and verifies HMAC-SHA256 session tokens and rejects tampering", async () => {
    const token = await createSessionToken(mockEnv, 24);
    expect(await verifySessionToken(mockEnv, token)).toBe(true);

    // Tampered signature
    const tampered = `${token.slice(0, -2)}xx`;
    expect(await verifySessionToken(mockEnv, tampered)).toBe(false);

    // Different secret
    const otherEnv = { ...mockEnv, SESSION_SECRET: "another-completely-different-secret-key" } as Env;
    expect(await verifySessionToken(otherEnv, token)).toBe(false);
  });

  it("allows /api/auth/logout only in password mode and disables it for cloudflare-access", async () => {
    const passwordRes = await app.request(
      "https://example.com/api/auth/logout",
      { method: "POST" },
      mockEnv
    );
    expect(passwordRes.status).toBe(200);

    const accessRes = await app.request(
      "https://example.com/api/auth/logout",
      { method: "POST" },
      { ...mockEnv, AUTH_MODE: "cloudflare-access" } as Env
    );
    expect(accessRes.status).toBe(400);

    const noneRes = await app.request(
      "https://example.com/api/auth/logout",
      { method: "POST" },
      { ...mockEnv, AUTH_MODE: "none" } as Env
    );
    expect(noneRes.status).toBe(400);
  });
});
