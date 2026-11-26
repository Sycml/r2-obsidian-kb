import { describe, expect, it } from "vitest";
import app from "./index";
import {
  applyReadingDeltas,
  createEmptyReadingStats,
  isValidDateKey,
  normalizeReadingStats,
  resolveReadingStatsKey,
  sanitizeReadingDeltas,
} from "./readingStats";
import type { Env, ReadingStatsData, VaultTreeResponse } from "./types";

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

describe("worker/readingStats utilities", () => {
  it("resolves hidden R2 metadata key safely outside vault notes", () => {
    expect(resolveReadingStatsKey("")).toBe(".r2-kb-data/reading-stats.json");
    expect(resolveReadingStatsKey(undefined)).toBe(".r2-kb-data/reading-stats.json");
    expect(resolveReadingStatsKey("obsidian/")).toBe(".r2-kb-data/obsidian/reading-stats.json");
    expect(resolveReadingStatsKey("/notes/vault/")).toBe(".r2-kb-data/notes/vault/reading-stats.json");
  });

  it("validates calendar date keys accurately", () => {
    expect(isValidDateKey("2026-11-25")).toBe(true);
    expect(isValidDateKey("2024-02-29")).toBe(true);
    expect(isValidDateKey("2025-02-29")).toBe(false);
    expect(isValidDateKey("2026-13-01")).toBe(false);
    expect(isValidDateKey("2026-1-5")).toBe(false);
    expect(isValidDateKey("not-a-date")).toBe(false);
  });

  it("sanitizes reading deltas and rejects malformed entries", () => {
    const cleaned = sanitizeReadingDeltas([
      { date: "2026-11-25", seconds: 45, noteKey: "欢迎使用.md" },
      { date: "2026-11-25", seconds: -10 },
      { date: "2026-11-25", seconds: 0 },
      { date: "invalid", seconds: 30 },
      { date: "2026-11-24", seconds: 999999, noteKey: "长笔记.md" },
    ]);

    expect(cleaned).toEqual([
      { date: "2026-11-25", seconds: 45, noteKey: "欢迎使用.md" },
      { date: "2026-11-24", seconds: 86_400, noteKey: "长笔记.md" },
    ]);
  });

  it("accumulates incremental deltas without losing existing history", () => {
    const base = createEmptyReadingStats("2026-11-24T00:00:00.000Z");
    const first = applyReadingDeltas(
      base,
      [
        { date: "2026-11-24", seconds: 120, noteKey: "A.md" },
        { date: "2026-11-25", seconds: 60, noteKey: "B.md" },
      ],
      "2026-11-25T10:00:00.000Z"
    );

    const second = applyReadingDeltas(
      first,
      [
        { date: "2026-11-25", seconds: 90, noteKey: "B.md" },
        { date: "2026-11-25", seconds: 30, noteKey: "C.md" },
      ],
      "2026-11-25T10:05:00.000Z"
    );

    expect(second.days["2026-11-24"]).toEqual({ seconds: 120, notes: { "A.md": 120 } });
    expect(second.days["2026-11-25"]).toEqual({
      seconds: 180,
      notes: { "B.md": 150, "C.md": 30 },
    });
    expect(second.updatedAt).toBe("2026-11-25T10:05:00.000Z");
  });

  it("normalizes corrupted or partial stored JSON gracefully", () => {
    const normalized = normalizeReadingStats({
      version: 1,
      updatedAt: "2026-11-25T00:00:00.000Z",
      days: {
        "2026-11-25": { seconds: 300, notes: { "a.md": 300, "bad.md": -5 } },
        "bad-date": { seconds: 100 },
        "2026-11-20": { seconds: 0 },
      },
    });

    expect(normalized.days).toEqual({
      "2026-11-25": { seconds: 300, notes: { "a.md": 300 } },
    });
  });

  it("persists deltas via /api/reading-stats without leaking metadata into /api/tree", async () => {
    const bucket = createMockR2Bucket({
      "欢迎使用.md": "# 欢迎",
    });

    // 1. Unauthenticated request in password mode is rejected
    const passwordEnv: Env = {
      NOTES_BUCKET: bucket,
      AUTH_MODE: "password",
      ACCESS_PASSWORD: "secret",
    };
    const unauthorizedRes = await app.request("/api/reading-stats", {}, passwordEnv);
    expect(unauthorizedRes.status).toBe(401);

    // 2. Authenticated (AUTH_MODE=none) GET + POST + GET round-trip
    const openEnv: Env = {
      NOTES_BUCKET: bucket,
      AUTH_MODE: "none",
    };

    const initialRes = await app.request("/api/reading-stats", {}, openEnv);
    expect(initialRes.status).toBe(200);
    const initialJson = (await initialRes.json()) as ReadingStatsData;
    expect(initialJson.days).toEqual({});

    const postRes = await app.request(
      "/api/reading-stats",
      {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({
          deltas: [{ date: "2026-11-25", seconds: 180, noteKey: "欢迎使用.md" }],
        }),
      },
      openEnv
    );
    expect(postRes.status).toBe(200);
    const updatedJson = (await postRes.json()) as ReadingStatsData;
    expect(updatedJson.days["2026-11-25"]).toEqual({
      seconds: 180,
      notes: { "欢迎使用.md": 180 },
    });

    // 3. Vault tree excludes hidden .r2-kb-data/reading-stats.json
    const treeRes = await app.request("/api/tree", {}, openEnv);
    expect(treeRes.status).toBe(200);
    const treeJson = (await treeRes.json()) as VaultTreeResponse;
    expect(treeJson.noteCount).toBe(1);
    expect(treeJson.files.map((f) => f.key)).toEqual(["欢迎使用.md"]);
  });
});
