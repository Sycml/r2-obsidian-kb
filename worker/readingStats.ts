import { normalizeVaultPrefix } from "./r2";
import type { DailyReadingRecord, ReadingDelta, ReadingStatsData } from "./types";

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DELTAS_PER_REQUEST = 100;
const MAX_SECONDS_PER_DAY = 86_400;
const MAX_NOTE_KEY_LENGTH = 512;

/**
 * Resolves the hidden metadata object key in R2.
 * Always rooted under `.r2-kb-data/` so it is ignored by `listVaultFromR2` and blocked by `/api/note` & `/api/asset`.
 */
export function resolveReadingStatsKey(vaultPrefix?: string): string {
  const normalizedPrefix = normalizeVaultPrefix(vaultPrefix).replace(/\/+$/, "");
  if (!normalizedPrefix) {
    return ".r2-kb-data/reading-stats.json";
  }
  const safeScope = normalizedPrefix.replace(/[^a-zA-Z0-9._/-]/g, "_");
  return `.r2-kb-data/${safeScope}/reading-stats.json`;
}

export function createEmptyReadingStats(nowIso = new Date().toISOString()): ReadingStatsData {
  return {
    version: 1,
    updatedAt: nowIso,
    days: {},
  };
}

export function isValidDateKey(value: string): boolean {
  if (!DATE_KEY_PATTERN.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

export function sanitizeReadingDeltas(raw: unknown): ReadingDelta[] {
  if (!Array.isArray(raw)) return [];
  const result: ReadingDelta[] = [];

  for (const item of raw.slice(0, MAX_DELTAS_PER_REQUEST)) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const date = typeof record.date === "string" ? record.date.trim() : "";
    if (!isValidDateKey(date)) continue;

    const rawSeconds = typeof record.seconds === "number" ? record.seconds : Number(record.seconds);
    if (!Number.isFinite(rawSeconds)) continue;
    const seconds = Math.min(MAX_SECONDS_PER_DAY, Math.round(rawSeconds));
    if (seconds <= 0) continue;

    let noteKey: string | undefined;
    if (typeof record.noteKey === "string") {
      const trimmed = record.noteKey.trim();
      if (trimmed && trimmed.length <= MAX_NOTE_KEY_LENGTH && !trimmed.includes("\0")) {
        noteKey = trimmed;
      }
    }

    result.push({ date, seconds, noteKey });
  }

  return result;
}

export function normalizeReadingStats(raw: unknown, nowIso = new Date().toISOString()): ReadingStatsData {
  if (!raw || typeof raw !== "object") {
    return createEmptyReadingStats(nowIso);
  }
  const obj = raw as Record<string, unknown>;
  const rawDays = obj.days && typeof obj.days === "object" ? (obj.days as Record<string, unknown>) : {};
  const days: Record<string, DailyReadingRecord> = {};

  for (const [dateKey, value] of Object.entries(rawDays)) {
    if (!isValidDateKey(dateKey) || !value || typeof value !== "object") continue;
    const rec = value as Record<string, unknown>;
    const seconds =
      typeof rec.seconds === "number" && Number.isFinite(rec.seconds)
        ? Math.min(MAX_SECONDS_PER_DAY, Math.max(0, Math.round(rec.seconds)))
        : 0;
    if (seconds <= 0) continue;

    let notes: Record<string, number> | undefined;
    if (rec.notes && typeof rec.notes === "object") {
      const cleanedNotes: Record<string, number> = {};
      for (const [k, v] of Object.entries(rec.notes as Record<string, unknown>)) {
        if (!k || k.length > MAX_NOTE_KEY_LENGTH) continue;
        const nSec =
          typeof v === "number" && Number.isFinite(v)
            ? Math.min(MAX_SECONDS_PER_DAY, Math.max(0, Math.round(v)))
            : 0;
        if (nSec > 0) {
          cleanedNotes[k] = nSec;
        }
      }
      if (Object.keys(cleanedNotes).length > 0) {
        notes = cleanedNotes;
      }
    }

    days[dateKey] = notes ? { seconds, notes } : { seconds };
  }

  return {
    version: 1,
    updatedAt: typeof obj.updatedAt === "string" ? obj.updatedAt : nowIso,
    days,
  };
}

export function applyReadingDeltas(
  current: ReadingStatsData,
  deltas: ReadingDelta[],
  nowIso = new Date().toISOString()
): ReadingStatsData {
  const nextDays: Record<string, DailyReadingRecord> = {};
  for (const [date, record] of Object.entries(current.days)) {
    nextDays[date] = {
      seconds: record.seconds,
      ...(record.notes ? { notes: { ...record.notes } } : {}),
    };
  }

  for (const delta of deltas) {
    const existing = nextDays[delta.date] || { seconds: 0 };
    const updatedSeconds = Math.min(MAX_SECONDS_PER_DAY, existing.seconds + delta.seconds);
    const updatedRecord: DailyReadingRecord = {
      seconds: updatedSeconds,
      ...(existing.notes ? { notes: { ...existing.notes } } : {}),
    };

    if (delta.noteKey) {
      if (!updatedRecord.notes) {
        updatedRecord.notes = {};
      }
      const prevNoteSeconds = updatedRecord.notes[delta.noteKey] || 0;
      updatedRecord.notes[delta.noteKey] = Math.min(
        MAX_SECONDS_PER_DAY,
        prevNoteSeconds + delta.seconds
      );
    }

    nextDays[delta.date] = updatedRecord;
  }

  return {
    version: 1,
    updatedAt: nowIso,
    days: nextDays,
  };
}

export async function loadReadingStatsFromR2(
  bucket: R2Bucket,
  vaultPrefix?: string
): Promise<ReadingStatsData> {
  const key = resolveReadingStatsKey(vaultPrefix);
  const obj = await bucket.get(key);
  if (!obj) {
    return createEmptyReadingStats();
  }
  try {
    const parsed = JSON.parse(await obj.text()) as unknown;
    return normalizeReadingStats(parsed);
  } catch {
    return createEmptyReadingStats();
  }
}

export async function saveReadingStatsToR2(
  bucket: R2Bucket,
  stats: ReadingStatsData,
  vaultPrefix?: string
): Promise<void> {
  const key = resolveReadingStatsKey(vaultPrefix);
  await bucket.put(key, JSON.stringify(stats), {
    httpMetadata: {
      contentType: "application/json; charset=utf-8",
    },
  });
}
