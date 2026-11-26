import type { DailyReadingRecord, ReadingDelta, ReadingStatsData } from "../types";

export const READING_STATS_CACHE_KEY = "r2-kb-reading-stats-cache";
export const READING_DELTAS_QUEUE_KEY = "r2-kb-reading-pending-deltas";

export type HeatmapLevel = 0 | 1 | 2 | 3 | 4;

export interface HeatmapCell {
  dateKey: string;
  seconds: number;
  level: HeatmapLevel;
  notes: Record<string, number>;
  inRange: boolean;
  isFuture: boolean;
  isToday: boolean;
  dayOfWeek: number; // 0 = Mon ... 6 = Sun
}

export interface HeatmapMonthLabel {
  weekIndex: number;
  label: string;
}

export interface HeatmapSummary {
  totalSeconds: number;
  todaySeconds: number;
  activeDays: number;
  currentStreak: number;
  longestStreak: number;
  maxDaySeconds: number;
}

export interface HeatmapGridData {
  weeks: HeatmapCell[][];
  monthLabels: HeatmapMonthLabel[];
  summary: HeatmapSummary;
}

const WEEKDAY_CN = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function createEmptyReadingStats(nowIso = new Date().toISOString()): ReadingStatsData {
  return {
    version: 1,
    updatedAt: nowIso,
    days: {},
  };
}

export function formatLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseLocalDateKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(date: Date, deltaDays: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + deltaDays);
}

export function formatChineseDate(dateKey: string): string {
  const dt = parseLocalDateKey(dateKey);
  if (Number.isNaN(dt.getTime())) return dateKey;
  const weekday = WEEKDAY_CN[dt.getDay()] || "";
  return `${dt.getFullYear()}年${dt.getMonth() + 1}月${dt.getDate()}日 ${weekday}`;
}

/**
 * Formats reading duration for display in Chinese.
 */
export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  if (safe === 0) return "0 分钟";
  if (safe < 60) return `${safe} 秒`;
  const totalMinutes = Math.floor(safe / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes} 分钟`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return mins > 0 ? `${hours} 小时 ${mins} 分钟` : `${hours} 小时`;
}

/**
 * Compact duration badge for tight spaces (header pill, mini widget).
 */
export function formatCompactDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  if (safe <= 0) return "0m";
  if (safe < 60) return `${safe}s`;
  const mins = Math.floor(safe / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (remMins === 0) return `${hours}h`;
  return `${hours}h ${remMins}m`;
}

/**
 * Maps daily reading seconds into 5 intuitive heatmap intensity levels:
 * 0: 0s | 1: 1s..<5m | 2: 5m..<20m | 3: 20m..<45m | 4: >=45m
 */
export function getHeatmapLevel(seconds: number): HeatmapLevel {
  if (seconds <= 0) return 0;
  if (seconds < 300) return 1;
  if (seconds < 1200) return 2;
  if (seconds < 2700) return 3;
  return 4;
}

export const HEATMAP_LEVEL_HINTS: Record<HeatmapLevel, string> = {
  0: "无阅读记录",
  1: "1 秒 – 5 分钟",
  2: "5 – 20 分钟",
  3: "20 – 45 分钟",
  4: "45 分钟以上",
};

/**
 * Compacts deltas by (date, noteKey) so network payloads and queues stay tiny.
 */
export function compactReadingDeltas(deltas: ReadingDelta[]): ReadingDelta[] {
  const map = new Map<string, ReadingDelta>();
  for (const delta of deltas) {
    if (!delta.date || delta.seconds <= 0) continue;
    const key = `${delta.date}\u0000${delta.noteKey || ""}`;
    const existing = map.get(key);
    if (existing) {
      existing.seconds += delta.seconds;
    } else {
      map.set(key, {
        date: delta.date,
        seconds: delta.seconds,
        ...(delta.noteKey ? { noteKey: delta.noteKey } : {}),
      });
    }
  }
  return Array.from(map.values());
}

/**
 * Purely merges pending deltas on top of a base ReadingStatsData snapshot.
 */
export function mergeReadingDeltas(
  base: ReadingStatsData,
  deltas: ReadingDelta[]
): ReadingStatsData {
  if (deltas.length === 0) return base;

  const days: Record<string, DailyReadingRecord> = {};
  for (const [dateKey, rec] of Object.entries(base.days)) {
    days[dateKey] = {
      seconds: rec.seconds,
      ...(rec.notes ? { notes: { ...rec.notes } } : {}),
    };
  }

  for (const delta of deltas) {
    if (!delta.date || delta.seconds <= 0) continue;
    const existing = days[delta.date] || { seconds: 0 };
    const nextRec: DailyReadingRecord = {
      seconds: Math.min(86_400, existing.seconds + delta.seconds),
      ...(existing.notes ? { notes: { ...existing.notes } } : {}),
    };
    if (delta.noteKey) {
      if (!nextRec.notes) nextRec.notes = {};
      nextRec.notes[delta.noteKey] = Math.min(
        86_400,
        (nextRec.notes[delta.noteKey] || 0) + delta.seconds
      );
    }
    days[delta.date] = nextRec;
  }

  return {
    version: 1,
    updatedAt: base.updatedAt,
    days,
  };
}

/**
 * Computes current streak (allowing today=0 if yesterday was active) and longest historical streak.
 */
export function computeStreaks(
  days: Record<string, DailyReadingRecord>,
  today: Date = new Date()
): { currentStreak: number; longestStreak: number } {
  const activeDateKeys = Object.entries(days)
    .filter(([, rec]) => rec && rec.seconds > 0)
    .map(([key]) => key)
    .sort();

  if (activeDateKeys.length === 0) {
    return { currentStreak: 0, longestStreak: 0 };
  }

  const activeSet = new Set(activeDateKeys);

  // Current streak: start from today if active, otherwise yesterday
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const todayKey = formatLocalDateKey(todayMidnight);
  const yesterday = addDays(todayMidnight, -1);
  const yesterdayKey = formatLocalDateKey(yesterday);

  let currentStreak = 0;
  let cursor: Date | null = activeSet.has(todayKey)
    ? todayMidnight
    : activeSet.has(yesterdayKey)
      ? yesterday
      : null;

  while (cursor && activeSet.has(formatLocalDateKey(cursor))) {
    currentStreak += 1;
    cursor = addDays(cursor, -1);
  }

  // Longest streak across all sorted active dates
  let longestStreak = 1;
  let run = 1;
  for (let i = 1; i < activeDateKeys.length; i++) {
    const prevDate = parseLocalDateKey(activeDateKeys[i - 1]);
    const expectedNext = formatLocalDateKey(addDays(prevDate, 1));
    if (activeDateKeys[i] === expectedNext) {
      run += 1;
      if (run > longestStreak) longestStreak = run;
    } else {
      run = 1;
    }
  }

  return { currentStreak, longestStreak };
}

/**
 * Returns available years present in the user's reading history (always includes current year).
 */
export function getAvailableYears(
  stats: ReadingStatsData,
  today: Date = new Date()
): number[] {
  const yearSet = new Set<number>([today.getFullYear()]);
  for (const [dateKey, rec] of Object.entries(stats.days)) {
    if (rec && rec.seconds > 0) {
      const year = Number(dateKey.slice(0, 4));
      if (Number.isInteger(year) && year >= 2000 && year <= 2100) {
        yearSet.add(year);
      }
    }
  }
  return Array.from(yearSet).sort((a, b) => b - a);
}

/**
 * Monday = 0 ... Sunday = 6
 */
function getMondayBasedDayOfWeek(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/**
 * Builds a Monday-to-Sunday column-major heatmap grid for either:
 * - "rolling": the last `weekCount` weeks ending on `today` (default 53 weeks, or e.g. 14 for sidebar)
 * - number (calendar year): Jan 1 .. Dec 31 of that year
 */
export function buildHeatmapGrid(
  stats: ReadingStatsData,
  options: {
    range: "rolling" | number;
    today?: Date;
    rollingWeeks?: number;
  }
): HeatmapGridData {
  const todayRaw = options.today || new Date();
  const today = new Date(todayRaw.getFullYear(), todayRaw.getMonth(), todayRaw.getDate());
  const todayKey = formatLocalDateKey(today);

  let rangeStart: Date;
  let rangeEnd: Date;

  if (options.range === "rolling") {
    const weekCount = Math.max(1, options.rollingWeeks || 53);
    rangeEnd = today;
    const endDow = getMondayBasedDayOfWeek(rangeEnd);
    const startOfCurrentWeek = addDays(rangeEnd, -endDow);
    rangeStart = addDays(startOfCurrentWeek, -(weekCount - 1) * 7);
  } else {
    rangeStart = new Date(options.range, 0, 1);
    rangeEnd = new Date(options.range, 11, 31);
  }

  // Align grid to Monday on or before rangeStart, and Sunday on or after rangeEnd
  const gridStart = addDays(rangeStart, -getMondayBasedDayOfWeek(rangeStart));
  const gridEnd = addDays(rangeEnd, 6 - getMondayBasedDayOfWeek(rangeEnd));

  const weeks: HeatmapCell[][] = [];
  const monthLabels: HeatmapMonthLabel[] = [];
  let lastLabeledMonth = -1;

  let totalSeconds = 0;
  let activeDays = 0;
  let maxDaySeconds = 0;

  let cursor = gridStart;
  let weekIndex = 0;

  while (cursor <= gridEnd) {
    const weekCells: HeatmapCell[] = [];
    let monthLabelAddedForWeek = false;

    for (let dow = 0; dow < 7; dow++) {
      const dateKey = formatLocalDateKey(cursor);
      const inRange = cursor >= rangeStart && cursor <= rangeEnd;
      const isFuture = cursor > today;
      const isToday = dateKey === todayKey;
      const rec = stats.days[dateKey];
      const seconds = inRange && !isFuture && rec ? rec.seconds : 0;
      const notes = inRange && !isFuture && rec?.notes ? rec.notes : {};

      if (inRange && !isFuture) {
        totalSeconds += seconds;
        if (seconds > 0) activeDays += 1;
        if (seconds > maxDaySeconds) maxDaySeconds = seconds;
      }

      // Place month label on the first week containing the 1st of a month (or week 0 if in range)
      if (!monthLabelAddedForWeek && inRange) {
        const month = cursor.getMonth();
        const isFirstOfMonth = cursor.getDate() === 1;
        if (month !== lastLabeledMonth && (isFirstOfMonth || weekIndex === 0)) {
          // Avoid overlapping consecutive labels when week 0 starts near month end
          const prevLabel = monthLabels[monthLabels.length - 1];
          if (!prevLabel || weekIndex - prevLabel.weekIndex >= 2) {
            monthLabels.push({ weekIndex, label: `${month + 1}月` });
            lastLabeledMonth = month;
            monthLabelAddedForWeek = true;
          } else {
            lastLabeledMonth = month;
          }
        }
      }

      weekCells.push({
        dateKey,
        seconds,
        level: inRange && !isFuture ? getHeatmapLevel(seconds) : 0,
        notes,
        inRange,
        isFuture,
        isToday,
        dayOfWeek: dow,
      });

      cursor = addDays(cursor, 1);
    }

    weeks.push(weekCells);
    weekIndex += 1;
  }

  const { currentStreak, longestStreak } = computeStreaks(stats.days, today);
  const todaySeconds = stats.days[todayKey]?.seconds || 0;

  return {
    weeks,
    monthLabels,
    summary: {
      totalSeconds,
      todaySeconds,
      activeDays,
      currentStreak,
      longestStreak,
      maxDaySeconds,
    },
  };
}

export function getNoteReadingSeconds(
  stats: ReadingStatsData,
  noteKey: string | null,
  today: Date = new Date()
): { todaySeconds: number; totalSeconds: number } {
  if (!noteKey) return { todaySeconds: 0, totalSeconds: 0 };
  const todayKey = formatLocalDateKey(today);
  let totalSeconds = 0;
  let todaySeconds = 0;

  for (const [dateKey, rec] of Object.entries(stats.days)) {
    const sec = rec.notes?.[noteKey] || 0;
    if (sec > 0) {
      totalSeconds += sec;
      if (dateKey === todayKey) {
        todaySeconds += sec;
      }
    }
  }
  return { todaySeconds, totalSeconds };
}

export function loadCachedReadingStats(): ReadingStatsData {
  try {
    const raw = localStorage.getItem(READING_STATS_CACHE_KEY);
    if (!raw) return createEmptyReadingStats();
    const parsed = JSON.parse(raw) as ReadingStatsData;
    if (parsed && parsed.version === 1 && parsed.days && typeof parsed.days === "object") {
      return parsed;
    }
  } catch {
    // Ignore corrupt cache or private mode errors
  }
  return createEmptyReadingStats();
}

export function saveCachedReadingStats(stats: ReadingStatsData): void {
  try {
    localStorage.setItem(READING_STATS_CACHE_KEY, JSON.stringify(stats));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadPendingDeltas(): ReadingDelta[] {
  try {
    const raw = localStorage.getItem(READING_DELTAS_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return compactReadingDeltas(
      parsed.filter(
        (item): item is ReadingDelta =>
          Boolean(item) &&
          typeof item === "object" &&
          typeof (item as ReadingDelta).date === "string" &&
          typeof (item as ReadingDelta).seconds === "number" &&
          (item as ReadingDelta).seconds > 0
      )
    );
  } catch {
    return [];
  }
}

export function savePendingDeltas(deltas: ReadingDelta[]): void {
  try {
    const compacted = compactReadingDeltas(deltas);
    if (compacted.length === 0) {
      localStorage.removeItem(READING_DELTAS_QUEUE_KEY);
    } else {
      localStorage.setItem(READING_DELTAS_QUEUE_KEY, JSON.stringify(compacted));
    }
  } catch {
    // Ignore storage quota errors
  }
}
