import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NoteView } from "./NoteView";

describe("NoteView welcome state", () => {
  it("renders note-selection welcome screen when no note is selected by default", () => {
    const html = renderToStaticMarkup(
      createElement(NoteView, {
        note: null,
        parsed: null,
        loading: false,
        error: null,
        noteReadingSeconds: 0,
        prevNote: null,
        nextNote: null,
        onNavigateNote: () => {},
        onOpenHeatmap: () => {},
        onOpenSidebar: () => {},
      })
    );

    expect(html).toContain("欢迎使用你的 R2 知识库");
    expect(html).toContain("浏览笔记目录");
  });
});
