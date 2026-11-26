import { useMemo } from "react";
import { ChevronRight, Flame } from "lucide-react";
import {
  buildHeatmapGrid,
  formatCompactDuration,
  formatDuration,
} from "../lib/readingStats";
import type { ReadingStatsData } from "../types";

interface MiniReadingHeatmapProps {
  stats: ReadingStatsData;
  isActivelyReading: boolean;
  onOpenFullModal: () => void;
}

export function MiniReadingHeatmap({
  stats,
  isActivelyReading,
  onOpenFullModal,
}: MiniReadingHeatmapProps) {
  const grid = useMemo(
    () =>
      buildHeatmapGrid(stats, {
        range: "rolling",
        rollingWeeks: 14,
      }),
    [stats]
  );

  const { todaySeconds, currentStreak } = grid.summary;

  return (
    <div className="sidebar-footer">
      <button
        type="button"
        className="mini-heatmap-card"
        onClick={onOpenFullModal}
        aria-label="查看完整阅读时长热力图"
      >
        <div className="mini-heatmap-top">
          <span className="mini-heatmap-title">
            <Flame size={14} className={todaySeconds > 0 ? "is-lit" : ""} />
            <span>阅读热力图</span>
            {isActivelyReading && (
              <span className="reading-live-dot" title="正在计时阅读" aria-hidden="true" />
            )}
          </span>
          <span className="mini-heatmap-stat">
            今日 {todaySeconds > 0 ? formatCompactDuration(todaySeconds) : "0m"}
            <ChevronRight size={13} />
          </span>
        </div>

        <div className="mini-heatmap-grid" aria-hidden="true">
          {grid.weeks.map((week, wIdx) => (
            <div key={wIdx} className="mini-heatmap-col">
              {week.map((cell) => (
                <span
                  key={cell.dateKey}
                  className={`mini-heatmap-cell level-${cell.level} ${
                    cell.isFuture || !cell.inRange ? "is-muted" : ""
                  } ${cell.isToday ? "is-today" : ""}`}
                  title={`${cell.dateKey} · ${formatDuration(cell.seconds)}`}
                />
              ))}
            </div>
          ))}
        </div>

        <div className="mini-heatmap-bottom">
          <span>
            {currentStreak > 0 ? `已连续阅读 ${currentStreak} 天` : "近 14 周阅读活跃度"}
          </span>
          <span>详情</span>
        </div>
      </button>
    </div>
  );
}
