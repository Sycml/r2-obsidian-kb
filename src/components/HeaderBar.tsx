import {
  Flame,
  ListTree,
  LogOut,
  Menu,
  PanelLeft,
  RefreshCw,
} from "lucide-react";
import type { AuthMode, ReadingSyncStatus } from "../types";
import type { AccentPreference, ThemePreference } from "../lib/theme";
import { formatCompactDuration, formatDuration } from "../lib/readingStats";
import { AppearancePopover } from "./AppearancePopover";

interface HeaderBarProps {
  siteTitle: string;
  currentNoteTitle: string;
  hasToc: boolean;
  refreshing: boolean;
  authMode: AuthMode;
  themePref: ThemePreference;
  accentPref: AccentPreference;
  accentSyncStatus: ReadingSyncStatus;
  todayReadingSeconds: number;
  isActivelyReading: boolean;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onOpenTocSheet: () => void;
  onOpenHeatmap: () => void;
  onRefresh: () => void;
  onChangeTheme: (pref: ThemePreference) => void;
  onChangeAccent: (accent: AccentPreference) => void;
  onLogout: () => void;
  onGoHome: () => void;
}

export function HeaderBar({
  siteTitle,
  currentNoteTitle,
  hasToc,
  refreshing,
  authMode,
  themePref,
  accentPref,
  accentSyncStatus,
  todayReadingSeconds,
  isActivelyReading,
  sidebarOpen,
  onToggleSidebar,
  onOpenTocSheet,
  onOpenHeatmap,
  onRefresh,
  onChangeTheme,
  onChangeAccent,
  onLogout,
  onGoHome,
}: HeaderBarProps) {
  const heatmapTitle =
    todayReadingSeconds > 0
      ? `阅读时长热力图（今日已读 ${formatDuration(todayReadingSeconds)}）`
      : "阅读时长热力图";

  return (
    <header className="header-bar">
      <div className="header-left">
        <button
          type="button"
          className={`icon-btn ${sidebarOpen ? "is-active" : ""}`}
          onClick={onToggleSidebar}
          title="切换目录导航"
          aria-label="切换目录导航"
        >
          <PanelLeft size={19} className="desktop-only-icon" />
          <Menu size={20} className="mobile-only-icon" />
        </button>

        <button type="button" className="brand-btn" onClick={onGoHome} title={siteTitle}>
          <img
            src="/icon-192.png?v=3"
            alt=""
            className="brand-icon"
            width={26}
            height={26}
          />
          <span className="brand-title">{siteTitle}</span>
        </button>

        {currentNoteTitle && (
          <span className="header-note-pill" title={currentNoteTitle}>
            {currentNoteTitle}
          </span>
        )}
      </div>

      <div className="header-right">
        {hasToc && (
          <button
            type="button"
            className="icon-btn toc-trigger-btn"
            onClick={onOpenTocSheet}
            title="文章大纲"
            aria-label="打开文章大纲"
          >
            <ListTree size={19} />
          </button>
        )}

        <button
          type="button"
          className={`header-reading-btn ${todayReadingSeconds > 0 ? "has-progress" : ""}`}
          onClick={onOpenHeatmap}
          title={heatmapTitle}
          aria-label={heatmapTitle}
        >
          <Flame size={17} className="reading-flame-icon" />
          <span className="header-reading-time">
            {todayReadingSeconds > 0 ? formatCompactDuration(todayReadingSeconds) : "热力图"}
          </span>
          {isActivelyReading && <span className="reading-live-dot" aria-hidden="true" />}
        </button>

        <AppearancePopover
          themePref={themePref}
          accentPref={accentPref}
          accentSyncStatus={accentSyncStatus}
          onChangeTheme={onChangeTheme}
          onChangeAccent={onChangeAccent}
        />

        <button
          type="button"
          className="icon-btn"
          onClick={onRefresh}
          disabled={refreshing}
          title="刷新 R2 最新目录与当前笔记"
          aria-label="刷新目录"
        >
          <RefreshCw size={18} className={refreshing ? "spin" : ""} />
        </button>

        {authMode === "password" && (
          <button
            type="button"
            className="icon-btn"
            onClick={onLogout}
            title="退出登录"
            aria-label="退出登录"
          >
            <LogOut size={18} />
          </button>
        )}
      </div>
    </header>
  );
}
