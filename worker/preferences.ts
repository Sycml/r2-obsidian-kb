import { normalizeVaultPrefix } from "./r2";
import type { UserPreferencesData } from "./types";

export const DEFAULT_ACCENT_ID = "violet";

const VALID_ACCENT_PRESET_IDS = new Set([
  "violet",
  "emerald",
  "ocean",
  "teal",
  "amber",
  "rose",
  "indigo",
  "slate",
]);

/**
 * Resolves the hidden R2 object key for synced user preferences.
 * Always rooted under `.r2-kb-data/` so it is ignored by vault listing and blocked by note/asset routes.
 */
export function resolvePreferencesKey(vaultPrefix?: string): string {
  const normalizedPrefix = normalizeVaultPrefix(vaultPrefix).replace(/\/+$/, "");
  if (!normalizedPrefix) {
    return ".r2-kb-data/preferences.json";
  }
  const safeScope = normalizedPrefix.replace(/[^a-zA-Z0-9._/-]/g, "_");
  return `.r2-kb-data/${safeScope}/preferences.json`;
}

export function normalizeAccentValue(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;

  if (VALID_ACCENT_PRESET_IDS.has(trimmed)) {
    return trimmed;
  }

  const shortHex = /^#?([0-9a-f]{3})$/.exec(trimmed);
  if (shortHex) {
    const [r, g, b] = shortHex[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`;
  }

  const fullHex = /^#?([0-9a-f]{6})$/.exec(trimmed);
  if (fullHex) {
    return `#${fullHex[1]}`;
  }

  return null;
}

export function createDefaultPreferences(): UserPreferencesData {
  return {
    version: 1,
    updatedAt: null,
    accent: DEFAULT_ACCENT_ID,
  };
}

export function normalizeUserPreferences(raw: unknown): UserPreferencesData {
  if (!raw || typeof raw !== "object") {
    return createDefaultPreferences();
  }
  const obj = raw as Record<string, unknown>;
  const accent = normalizeAccentValue(obj.accent) || DEFAULT_ACCENT_ID;
  const updatedAt = typeof obj.updatedAt === "string" && obj.updatedAt.trim() ? obj.updatedAt : null;

  return {
    version: 1,
    updatedAt,
    accent,
  };
}

export async function loadPreferencesFromR2(
  bucket: R2Bucket,
  vaultPrefix?: string
): Promise<UserPreferencesData> {
  const key = resolvePreferencesKey(vaultPrefix);
  const obj = await bucket.get(key);
  if (!obj) {
    return createDefaultPreferences();
  }
  try {
    const parsed = JSON.parse(await obj.text()) as unknown;
    return normalizeUserPreferences(parsed);
  } catch {
    return createDefaultPreferences();
  }
}

export async function savePreferencesToR2(
  bucket: R2Bucket,
  accent: string,
  vaultPrefix?: string,
  nowIso = new Date().toISOString()
): Promise<UserPreferencesData> {
  const normalizedAccent = normalizeAccentValue(accent) || DEFAULT_ACCENT_ID;
  const payload: UserPreferencesData = {
    version: 1,
    updatedAt: nowIso,
    accent: normalizedAccent,
  };
  const key = resolvePreferencesKey(vaultPrefix);
  await bucket.put(key, JSON.stringify(payload), {
    httpMetadata: {
      contentType: "application/json; charset=utf-8",
    },
  });
  return payload;
}
