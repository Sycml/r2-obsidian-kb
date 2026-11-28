import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HeaderBar } from "./HeaderBar";
import type { AuthMode } from "../types";

function renderHeader(authMode: AuthMode, withLogout = true): string {
  return renderToStaticMarkup(
    createElement(HeaderBar, {
      siteTitle: "我的知识库",
      currentNoteTitle: "测试笔记",
      hasToc: true,
      refreshing: false,
      authMode,
      themePref: "system",
      accentPref: "obsidian",
      accentSyncStatus: "synced",
      sidebarOpen: true,
      onToggleSidebar: () => {},
      onOpenTocSheet: () => {},
      onRefresh: () => {},
      onChangeTheme: () => {},
      onChangeAccent: () => {},
      onLogout: withLogout ? () => {} : undefined,
      onGoHome: () => {},
    })
  );
}

describe("HeaderBar", () => {
  it("does not render the heatmap button in the top header bar", () => {
    const html = renderHeader("password");
    expect(html).not.toContain("header-reading-btn");
    expect(html).not.toContain("阅读时长热力图");
    expect(html).not.toContain("热力图");
  });

  it("renders logout button in password mode and hides it in cloudflare-access and none modes", () => {
    const passwordHtml = renderHeader("password", true);
    expect(passwordHtml).toContain("退出登录");

    const accessHtml = renderHeader("cloudflare-access", true);
    expect(accessHtml).not.toContain("退出登录");

    const noneHtml = renderHeader("none", true);
    expect(noneHtml).not.toContain("退出登录");

    const noHandlerHtml = renderHeader("password", false);
    expect(noHandlerHtml).not.toContain("退出登录");
  });
});
