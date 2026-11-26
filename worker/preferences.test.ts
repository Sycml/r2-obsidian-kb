import { describe, expect, it } from "vitest";
import app from "./index";
import {
  DEFAULT_ACCENT_ID,
  normalizeAccentValue,
  normalizeUserPreferences,
  resolvePreferencesKey,
} from "./preferences";
import type { Env, UserPreferencesData, VaultTreeResponse } from "./types";

function createMockR2Bucket(initial: Record<string, string> = {}): R2Bucket {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    async get(key: string) {
      const value = store.get(key);
      if (value === undefined) return null;
      return {
        key,
        size: value.length,
        etag: "mock-etag",
        httpEtag: '"mock-etag"',
        uploaded: new Date("2026-11-25T00:00:00.000Z"),
        text: async () => value,
      };
    },
    async put(key: string, value: string) {
      store.set(key, typeof value === "string" ? value : String(value));
      return { key };
    },
    async list(options?: { prefix?: string }) {
      const prefix = options?.prefix || "";
      const objects = Array.from(store.entries())
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => ({
          key,
          size: value.length,
          etag: "mock-etag",
          uploaded: new Date("2026-11-25T00:00:00.000Z"),
        }));
      return { objects, truncated: false };
    },
  } as unknown as R2Bucket;
}

describe("worker/preferences utilities & API", () => {
  it("resolves hidden R2 metadata key outside vault notes", () => {
    expect(resolvePreferencesKey("")).toBe(".r2-kb-data/preferences.json");
    expect(resolvePreferencesKey(undefined)).toBe(".r2-kb-data/preferences.json");
    expect(resolvePreferencesKey("obsidian/")).toBe(".r2-kb-data/obsidian/preferences.json");
  });

  it("normalizes preset ids and custom hex colors while rejecting invalid inputs", () => {
    expect(normalizeAccentValue("emerald")).toBe("emerald");
    expect(normalizeAccentValue("  OCEAN ")).toBe("ocean");
    expect(normalizeAccentValue("#abc")).toBe("#aabbcc");
    expect(normalizeAccentValue("10B981")).toBe("#10b981");
    expect(normalizeAccentValue("invalid-preset")).toBeNull();
    expect(normalizeAccentValue("#12345")).toBeNull();
    expect(normalizeAccentValue(123)).toBeNull();
  });

  it("normalizes partial or malformed stored JSON safely", () => {
    expect(normalizeUserPreferences(null)).toEqual({
      version: 1,
      updatedAt: null,
      accent: DEFAULT_ACCENT_ID,
    });
    expect(
      normalizeUserPreferences({
        version: 1,
        accent: "#E11D48",
        updatedAt: "2026-11-25T10:00:00.000Z",
      })
    ).toEqual({
      version: 1,
      accent: "#e11d48",
      updatedAt: "2026-11-25T10:00:00.000Z",
    });
  });

  it("persists theme accent via /api/preferences and keeps /api/tree clean", async () => {
    const bucket = createMockR2Bucket({
      "欢迎使用.md": "# 欢迎",
    });

    // 1. Protected by auth middleware
    const passwordEnv: Env = {
      NOTES_BUCKET: bucket,
      AUTH_MODE: "password",
      ACCESS_PASSWORD: "secret",
    };
    const unauthorizedRes = await app.request("/api/preferences", {}, passwordEnv);
    expect(unauthorizedRes.status).toBe(401);

    // 2. Open env GET default -> PUT custom -> GET persisted
    const openEnv: Env = {
      NOTES_BUCKET: bucket,
      AUTH_MODE: "none",
    };

    const initialRes = await app.request("/api/preferences", {}, openEnv);
    expect(initialRes.status).toBe(200);
    const initialJson = (await initialRes.json()) as UserPreferencesData;
    expect(initialJson).toEqual({
      version: 1,
      updatedAt: null,
      accent: DEFAULT_ACCENT_ID,
    });

    // Invalid accent returns 400
    const badRes = await app.request(
      "/api/preferences",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accent: "not-a-color" }),
      },
      openEnv
    );
    expect(badRes.status).toBe(400);

    // Valid accent saves to R2
    const putRes = await app.request(
      "/api/preferences",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accent: "emerald" }),
      },
      openEnv
    );
    expect(putRes.status).toBe(200);
    const savedJson = (await putRes.json()) as UserPreferencesData;
    expect(savedJson.accent).toBe("emerald");
    expect(typeof savedJson.updatedAt).toBe("string");

    // Subsequent GET returns persisted accent
    const reloadRes = await app.request("/api/preferences", {}, openEnv);
    const reloadedJson = (await reloadRes.json()) as UserPreferencesData;
    expect(reloadedJson.accent).toBe("emerald");
    expect(reloadedJson.updatedAt).toBe(savedJson.updatedAt);

    // 3. Vault tree excludes .r2-kb-data/preferences.json
    const treeRes = await app.request("/api/tree", {}, openEnv);
    const treeJson = (await treeRes.json()) as VaultTreeResponse;
    expect(treeJson.noteCount).toBe(1);
    expect(treeJson.files.map((f) => f.key)).toEqual(["欢迎使用.md"]);
  });
});
