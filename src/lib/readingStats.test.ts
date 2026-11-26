import { describe, expect, it } from "vitest";
import {
  buildHeatmapGrid,
  compactReadingDeltas,
  computeStreaks,
  createEmptyReadingStats,
  formatCompactDuration,
  formatDuration,
  formatLocalDateKey,
  getHeatmapLevel,
  getNoteReadingSeconds,
  mergeReadingDeltas,
} from "./readingStats";

describe("readingStats utilities", () => {
  it("formats local dates and Chinese durations accurately", () => {
    expect(formatLocalDateKey(new Date(2026, 10, 5))).toBe("2026-11-05");
    expect(formatDuration(0)).toBe("0 分钟");
    expect(formatDuration(45)).toBe("45 秒");
    expect(formatDuration(360)).toBe("6 分钟");
    expect(formatDuration(3600)).toBe("1 小时");
    expect(formatDuration(5100)).toBe("1 小时 25 分钟");

    expect(formatCompactDuration(0)).toBe("0m");
    expect(formatCompactDuration(30)).toBe("30s");
    expect(formatCompactDuration(720)).toBe("12m");
    expect(formatCompactDuration(5400)).toBe("1h 30m");
  });

  it("maps reading seconds to 5 heatmap intensity levels", () => {
    expect(getHeatmapLevel(0)).toBe(0);
    expect(getHeatmapLevel(60)).toBe(1);
    expect(getHeatmapLevel(299)).toBe(1);
    expect(getHeatmapLevel(300)).toBe(2);
    expect(getHeatmapLevel(1200)).toBe(3);
    expect(getHeatmapLevel(2700)).toBe(4);
  });

  it("compacts and merges deltas without mutating base stats", () => {
    const compacted = compactReadingDeltas([
      { date: "2026-11-25", seconds: 10, noteKey: "A.md" },
      { date: "2026-11-25", seconds: 25, noteKey: "A.md" },
      { date: "2026-11-25", seconds: 15, noteKey: "B.md" },
    ]);
    expect(compacted).toEqual([
      { date: "2026-11-25", seconds: 35, noteKey: "A.md" },
      { date: "2026-11-25", seconds: 15, noteKey: "B.md" },
    ]);

    const base = createEmptyReadingStats("2026-11-25T00:00:00Z");
    const merged = mergeReadingDeltas(base, compacted);
    expect(base.days).toEqual({});
    expect(merged.days["2026-11-25"]).toEqual({
      seconds: 50,
      notes: { "A.md": 35, "B.md": 15 },
    });
  });

  it("computes current streak (graceful when today has not started yet) and longest streak", () => {
    const today = new Date(2026, 10, 25); // 2026-11-25
    const days = {
      "2026-11-10": { seconds: 600 },
      "2026-11-11": { seconds: 600 },
      "2026-11-12": { seconds: 600 },
      "2026-11-13": { seconds: 600 },
      "2026-11-23": { seconds: 300 },
      "2026-11-24": { seconds: 500 },
    };

    // Today has 0s, but yesterday & day before were active -> currentStreak = 2, longest = 4
    expect(computeStreaks(days, today)).toEqual({
      currentStreak: 2,
      longestStreak: 4,
    });

    // Once user reads today, currentStreak becomes 3
    expect(
      computeStreaks({ ...days, "2026-11-25": { seconds: 120 } }, today)
    ).toEqual({
      currentStreak: 3,
      longestStreak: 4,
    });
  });

  it("builds aligned Monday-to-Sunday rolling and calendar-year heatmap grids", () => {
    const today = new Date(2026, 10, 25); // Wednesday 2026-11-25
    const stats = mergeReadingDeltas(createEmptyReadingStats(), [
      { date: "2026-11-24", seconds: 1500, noteKey: "技术/R2.md" },
      { date: "2026-11-25", seconds: 3000, noteKey: "技术/R2.md" },
    ]);

    const rolling = buildHeatmapGrid(stats, {
      range: "rolling",
      today,
      rollingWeeks: 12,
    });

    expect(rolling.weeks).toHaveLength(12);
    expect(rolling.weeks.every((w) => w.length === 7)).toBe(true);
    expect(rolling.summary.todaySeconds).toBe(3000);
    expect(rolling.summary.totalSeconds).toBe(4500);
    expect(rolling.summary.activeDays).toBe(2);
    expect(rolling.summary.currentStreak).toBe(2);

    const lastWeek = rolling.weeks[rolling.weeks.length - 1];
    const todayCell = lastWeek.find((c) => c.dateKey === "2026-11-25");
    expect(todayCell?.isToday).toBe(true);
    expect(todayCell?.level).toBe(4);
    expect(lastWeek[6].isFuture).toBe(true);

    // Per-note aggregation
    expect(getNoteReadingSeconds(stats, "技术/R2.md", today)).toEqual({
      todaySeconds: 3000,
      totalSeconds: 4500,
    });
  });
});
