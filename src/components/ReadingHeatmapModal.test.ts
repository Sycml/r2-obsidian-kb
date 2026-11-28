import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReadingHeatmapModal } from "./ReadingHeatmapModal";
import { createEmptyReadingStats } from "../lib/readingStats";

describe("ReadingHeatmapModal layout", () => {
  it("renders all week columns and syncs month track column sizing via CSS variable", () => {
    const html = renderToStaticMarkup(
      createElement(ReadingHeatmapModal, {
        open: true,
        stats: createEmptyReadingStats("2026-11-27T00:00:00.000Z"),
        syncStatus: "synced",
        onClose: () => {},
        onNavigateNote: () => {},
      })
    );

    expect(html).toContain("var(--heatmap-cell-size, 12px)");
    expect(html).not.toContain("repeat(53, 13px)");
  });

  it("ensures heatmap modal width accommodates full 54-week canvas plus right padding without clipping", () => {
    const css = fs.readFileSync(path.resolve(__dirname, "../styles/app.css"), "utf-8");
    expect(css).toContain("width: min(920px, 100%);");
    expect(css).toContain("--heatmap-cell-size: 12px;");
    expect(css).toContain("padding: 4px 14px 4px 4px;");
  });
});
