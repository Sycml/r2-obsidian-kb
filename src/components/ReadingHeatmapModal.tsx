import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Cloud, CloudOff, Flame, RefreshCw, X } from "lucide-react";
import {
  buildHeatmapGrid,
  formatChineseDate,
  formatDuration,
  formatLocalDateKey,
  getAvailableYears,
  HEATMAP_LEVEL_HINTS,
  type HeatmapCell,
  type HeatmapLevel,
} from "../lib/readingStats";
import type { ReadingStatsData, ReadingSyncStatus } from "../types";

interface ReadingHeatmapModalProps {
  open: boolean;
  stats: ReadingStatsData;
  syncStatus: ReadingSyncStatus;
  onClose: () => void;
  onNavigateNote: (noteKey: string) => void;
}

const WEEKDAY_LABELS = [
  { row: 0, text: "一" },
  { row: 2, text: "三" },
  { row: 4, text: "五" },
  { row: 6, text: "日" },
];

const LEVELS: HeatmapLevel[] = [0, 1, 2, 3, 4];

function getNoteDisplayName(noteKey: string): string {
  const filename = noteKey.split("/").pop() || noteKey;
  return filename.replace(/\.md$/i, "");
}

export function ReadingHeatmapModal({
  open,
  stats,
  syncStatus,
  onClose,
  onNavigateNote,
}: ReadingHeatmapModalProps) {
  const todayKey = formatLocalDateKey(new Date());
  const availableYears = useMemo(() => getAvailableYears(stats), [stats]);
  const [range, setRange] = useState<"rolling" | number>("rolling");
  const [selectedDateKey, setSelectedDateKey] = useState<string>(todayKey);
  const [hoveredCell, setHoveredCell] = useState<{
    cell: HeatmapCell;
    left: number;
    top: number;
  } | null>(null);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const gridWrapRef = useRef<HTMLDivElement | null>(null);

  const grid = useMemo(
    () =>
      buildHeatmapGrid(stats, {
        range,
        rollingWeeks: 53,
      }),
    [stats, range]
  );

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Auto-scroll heatmap to the right (most recent weeks) when opened or switching to rolling
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      if (scrollerRef.current && range === "rolling") {
        scrollerRef.current.scrollLeft = scrollerRef.current.scrollWidth;
      }
    });
  }, [open, range]);

  // Keep selected date within the active range
  useEffect(() => {
    if (!open) return;
    const allInRange = grid.weeks.flat().filter((c) => c.inRange && !c.isFuture);
    if (allInRange.some((c) => c.dateKey === selectedDateKey)) return;
    const lastActive = [...allInRange].reverse().find((c) => c.seconds > 0);
    setSelectedDateKey(lastActive?.dateKey || allInRange[allInRange.length - 1]?.dateKey || todayKey);
  }, [open, grid, selectedDateKey, todayKey]);

  if (!open) return null;

  const selectedRecord = stats.days[selectedDateKey];
  const selectedSeconds = selectedRecord?.seconds || 0;
  const selectedNotes = Object.entries(selectedRecord?.notes || {})
    .filter(([, sec]) => sec > 0)
    .sort((a, b) => b[1] - a[1]);

  const handleCellEnter = (cell: HeatmapCell, target: HTMLElement) => {
    if (!cell.inRange || cell.isFuture || !gridWrapRef.current) return;
    const wrapRect = gridWrapRef.current.getBoundingClientRect();
    const cellRect = target.getBoundingClientRect();
    const rawLeft = cellRect.left - wrapRect.left + cellRect.width / 2;
    const edgePadding = 96;
    const clampedLeft =
      wrapRect.width > edgePadding * 2
        ? Math.min(wrapRect.width - edgePadding, Math.max(edgePadding, rawLeft))
        : wrapRect.width / 2;
    setHoveredCell({
      cell,
      left: clampedLeft,
      top: cellRect.top - wrapRect.top,
    });
  };

  const rangeLabel = range === "rolling" ? "近一年累计" : `${range} 年累计`;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="阅读时长热力图"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="heatmap-modal">
        <div className="heatmap-modal-header">
          <div className="heatmap-title-group">
            <span className="heatmap-title-icon">
              <Flame size={18} />
            </span>
            <div>
              <h2 className="heatmap-modal-title">阅读时长热力图</h2>
              <div className="heatmap-sync-meta">
                {syncStatus === "synced" && (
                  <>
                    <Cloud size={12} />
                    <span>已同步至 Cloudflare R2</span>
                  </>
                )}
                {syncStatus === "syncing" && (
                  <>
                    <RefreshCw size={12} className="spin" />
                    <span>正在同步阅读记录...</span>
                  </>
                )}
                {syncStatus === "local" && (
                  <>
                    <CloudOff size={12} />
                    <span>已缓存在本地，恢复连接后自动同步</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="heatmap-header-actions">
            <div className="heatmap-range-tabs" role="tablist" aria-label="时间范围">
              <button
                type="button"
                role="tab"
                aria-selected={range === "rolling"}
                className={`range-tab-btn ${range === "rolling" ? "is-active" : ""}`}
                onClick={() => setRange("rolling")}
              >
                近一年
              </button>
              {availableYears.map((year) => (
                <button
                  key={year}
                  type="button"
                  role="tab"
                  aria-selected={range === year}
                  className={`range-tab-btn ${range === year ? "is-active" : ""}`}
                  onClick={() => setRange(year)}
                >
                  {year}
                </button>
              ))}
            </div>

            <button
              type="button"
              className="icon-btn"
              onClick={onClose}
              aria-label="关闭阅读时长热力图"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="heatmap-summary-strip">
          <div className="summary-metric">
            <span className="summary-metric-label">今日阅读</span>
            <strong className="summary-metric-value">
              {formatDuration(grid.summary.todaySeconds)}
            </strong>
          </div>
          <div className="summary-metric">
            <span className="summary-metric-label">{rangeLabel}</span>
            <strong className="summary-metric-value">
              {formatDuration(grid.summary.totalSeconds)}
            </strong>
          </div>
          <div className="summary-metric">
            <span className="summary-metric-label">连续阅读</span>
            <strong className="summary-metric-value">
              {grid.summary.currentStreak} 天
              {grid.summary.longestStreak > grid.summary.currentStreak && (
                <span className="summary-metric-sub">（最长 {grid.summary.longestStreak} 天）</span>
              )}
            </strong>
          </div>
          <div className="summary-metric">
            <span className="summary-metric-label">活跃天数</span>
            <strong className="summary-metric-value">{grid.summary.activeDays} 天</strong>
          </div>
        </div>

        <div className="heatmap-board" ref={gridWrapRef}>
          {hoveredCell && (
            <div
              className="heatmap-tooltip"
              style={{
                left: hoveredCell.left,
                top: hoveredCell.top,
              }}
              role="status"
            >
              <strong>{formatChineseDate(hoveredCell.cell.dateKey)}</strong>
              <span>
                {hoveredCell.cell.seconds > 0
                  ? `阅读 ${formatDuration(hoveredCell.cell.seconds)}`
                  : "当日无阅读记录"}
              </span>
            </div>
          )}

          <div
            className="heatmap-scroller"
            ref={scrollerRef}
            onScroll={() => setHoveredCell(null)}
            onMouseLeave={() => setHoveredCell(null)}
          >
            <div className="heatmap-canvas">
              <div className="heatmap-months-row">
                <div className="heatmap-weekday-spacer" />
                <div
                  className="heatmap-months-track"
                  style={{
                    gridTemplateColumns: `repeat(${grid.weeks.length}, 13px)`,
                  }}
                >
                  {grid.monthLabels.map((m) => (
                    <span
                      key={`${m.weekIndex}-${m.label}`}
                      className="heatmap-month-label"
                      style={{ gridColumnStart: m.weekIndex + 1 }}
                    >
                      {m.label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="heatmap-grid-body">
                <div className="heatmap-weekdays-col" aria-hidden="true">
                  {Array.from({ length: 7 }).map((_, rowIdx) => {
                    const label = WEEKDAY_LABELS.find((item) => item.row === rowIdx);
                    return (
                      <span key={rowIdx} className="heatmap-weekday-label">
                        {label ? label.text : ""}
                      </span>
                    );
                  })}
                </div>

                <div className="heatmap-weeks-row">
                  {grid.weeks.map((week, wIdx) => (
                    <div key={wIdx} className="heatmap-week-col">
                      {week.map((cell) => {
                        const disabled = !cell.inRange || cell.isFuture;
                        const isSelected = !disabled && cell.dateKey === selectedDateKey;
                        return (
                          <button
                            key={cell.dateKey}
                            type="button"
                            disabled={disabled}
                            className={`heatmap-cell level-${cell.level} ${
                              disabled ? "is-outside" : ""
                            } ${cell.isToday ? "is-today" : ""} ${
                              isSelected ? "is-selected" : ""
                            }`}
                            aria-label={`${formatChineseDate(cell.dateKey)}，${
                              cell.seconds > 0
                                ? `阅读 ${formatDuration(cell.seconds)}`
                                : "无阅读记录"
                            }`}
                            onMouseEnter={(e) => handleCellEnter(cell, e.currentTarget)}
                            onFocus={(e) => handleCellEnter(cell, e.currentTarget)}
                            onBlur={() => setHoveredCell(null)}
                            onClick={() => {
                              if (!disabled) setSelectedDateKey(cell.dateKey);
                            }}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="heatmap-legend-bar">
            <span className="heatmap-legend-hint">仅统计页面前台活跃阅读时长（无操作 60 秒自动暂停）</span>
            <div className="heatmap-legend-scale" aria-label="阅读时长强度图例">
              <span>少</span>
              {LEVELS.map((lvl) => (
                <span
                  key={lvl}
                  className={`heatmap-legend-cell level-${lvl}`}
                  title={HEATMAP_LEVEL_HINTS[lvl]}
                />
              ))}
              <span>多</span>
            </div>
          </div>
        </div>

        <div className="heatmap-day-detail">
          <div className="day-detail-header">
            <span className="day-detail-date">{formatChineseDate(selectedDateKey)}</span>
            <span className="day-detail-total">
              {selectedSeconds > 0 ? `共阅读 ${formatDuration(selectedSeconds)}` : "当天暂无阅读记录"}
            </span>
          </div>

          {selectedNotes.length > 0 ? (
            <ul className="day-detail-notes">
              {selectedNotes.slice(0, 8).map(([noteKey, sec]) => {
                const ratio = selectedSeconds > 0 ? Math.max(6, Math.round((sec / selectedSeconds) * 100)) : 0;
                return (
                  <li key={noteKey} className="day-note-item">
                    <button
                      type="button"
                      className="day-note-btn"
                      onClick={() => {
                        onNavigateNote(noteKey);
                        onClose();
                      }}
                      title={noteKey}
                    >
                      <span className="day-note-main">
                        <BookOpen size={14} className="day-note-icon" />
                        <span className="day-note-name">{getNoteDisplayName(noteKey)}</span>
                      </span>
                      <span className="day-note-bar-wrap">
                        <span className="day-note-bar" style={{ width: `${ratio}%` }} />
                      </span>
                      <span className="day-note-duration">{formatDuration(sec)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="day-detail-empty">
              点击上方任意日期格子可查看当日阅读详情；阅读笔记时系统会自动记录你的专注时长。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
