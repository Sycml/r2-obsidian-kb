import { describe, expect, it } from "vitest";
import {
  ACCENT_PRESETS,
  computeAccentTokens,
  DEFAULT_ACCENT_ID,
  getReadableOnAccentColor,
  normalizeHexColor,
  resolveAccentHex,
} from "./theme";

describe("theme accent color engine", () => {
  it("normalizes 3-digit and 6-digit hex strings and rejects invalid values", () => {
    expect(normalizeHexColor("#abc")).toBe("#aabbcc");
    expect(normalizeHexColor("10B981")).toBe("#10b981");
    expect(normalizeHexColor("  #6B4EFF ")).toBe("#6b4eff");
    expect(normalizeHexColor("not-a-color")).toBeNull();
    expect(normalizeHexColor("#12345")).toBeNull();
  });

  it("resolves preset ids, custom hex colors, and falls back to default", () => {
    expect(resolveAccentHex("emerald")).toBe("#15805b");
    expect(resolveAccentHex("#ff5500")).toBe("#ff5500");
    expect(resolveAccentHex("unknown-preset")).toBe(
      ACCENT_PRESETS.find((p) => p.id === DEFAULT_ACCENT_ID)!.hex
    );
  });

  it("picks readable text-on-accent colors for light and dark swatches", () => {
    expect(getReadableOnAccentColor("#6b4eff")).toBe("#ffffff");
    expect(getReadableOnAccentColor("#15805b")).toBe("#ffffff");
    expect(getReadableOnAccentColor("#facc15")).toBe("#111827");
    expect(getReadableOnAccentColor("#ffffff")).toBe("#111827");
  });

  it("computes full CSS variable token sets including 4-step heatmap ramps for light and dark modes", () => {
    const lightTokens = computeAccentTokens("emerald", "light");
    const darkTokens = computeAccentTokens("emerald", "dark");

    expect(lightTokens["--accent"]).toBe("#15805b");
    expect(lightTokens["--heatmap-1"]).toMatch(/^#[0-9a-f]{6}$/);
    expect(lightTokens["--heatmap-4"]).toBe("#15805b");
    expect(lightTokens["--bg-active"]).toContain("rgba(");

    // Dark mode lifts deep emerald to a more luminous shade
    expect(darkTokens["--accent"]).not.toBe("#15805b");
    expect(darkTokens["--heatmap-4"]).toBe(darkTokens["--accent"]);
    expect(darkTokens["--heatmap-1"]).not.toBe(darkTokens["--heatmap-4"]);
  });

  it("keeps custom very bright yellow text links legible in light mode", () => {
    const tokens = computeAccentTokens("#facc15", "light");
    expect(tokens["--text-on-accent"]).toBe("#111827");
    // Text accent should be darkened below the bright yellow base
    expect(tokens["--text-accent"]).not.toBe("#facc15");
  });
});
