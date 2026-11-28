import {
  ListTree,
  LogOut,
  Menu,
  PanelLeft,
  RefreshCw,
} from "lucide-react";
import type { AuthMode, ReadingSyncStatus } from "../types";
import type { AccentPreference, ThemePreference } from "../lib/theme";
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
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onOpenTocSheet: () => void;
  onRefresh: () => void;
  onChangeTheme: (pref: ThemePreference) => void;
  onChangeAccent: (accent: AccentPreference) => void;
  onLogout?: () => void;
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
  sidebarOpen,
  onToggleSidebar,
  onOpenTocSheet,
  onRefresh,
  onChangeTheme,
  onChangeAccent,
  onLogout,
  onGoHome,
}: HeaderBarProps) {
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
            src="/icon-192.png?v=2"
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

        {authMode === "password" && onLogout && (
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
