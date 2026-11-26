import {
  ListTree,
  LogOut,
  Menu,
  Monitor,
  Moon,
  PanelLeft,
  RefreshCw,
  Sun,
} from "lucide-react";
import type { AuthMode } from "../types";
import type { ThemePreference } from "../lib/theme";

interface HeaderBarProps {
  siteTitle: string;
  currentNoteTitle: string;
  hasToc: boolean;
  refreshing: boolean;
  authMode: AuthMode;
  themePref: ThemePreference;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onOpenTocSheet: () => void;
  onRefresh: () => void;
  onCycleTheme: () => void;
  onLogout: () => void;
  onGoHome: () => void;
}

const THEME_TITLE: Record<ThemePreference, string> = {
  system: "主题：跟随系统（点击切换）",
  light: "主题：浅色模式（点击切换）",
  dark: "主题：深色模式（点击切换）",
};

export function HeaderBar({
  siteTitle,
  currentNoteTitle,
  hasToc,
  refreshing,
  authMode,
  themePref,
  sidebarOpen,
  onToggleSidebar,
  onOpenTocSheet,
  onRefresh,
  onCycleTheme,
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

        <button
          type="button"
          className="icon-btn"
          onClick={onCycleTheme}
          title={THEME_TITLE[themePref]}
          aria-label={THEME_TITLE[themePref]}
        >
          {themePref === "light" && <Sun size={18} />}
          {themePref === "dark" && <Moon size={18} />}
          {themePref === "system" && <Monitor size={18} />}
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
