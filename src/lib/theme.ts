export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";
export type AccentPreference = string;

export interface AccentPreset {
  id: string;
  name: string;
  hex: string;
}

export const DEFAULT_ACCENT_ID = "violet";

export const ACCENT_PRESETS: readonly AccentPreset[] = [
  { id: "violet", name: "曜紫", hex: "#6b4eff" },
  { id: "emerald", name: "松绿", hex: "#15805b" },
  { id: "ocean", name: "海蓝", hex: "#2563eb" },
  { id: "teal", name: "青黛", hex: "#0d8a8a" },
  { id: "amber", name: "琥珀", hex: "#c96a0b" },
  { id: "rose", name: "绯红", hex: "#dc2663" },
  { id: "indigo", name: "靛青", hex: "#4353e8" },
  { id: "slate", name: "墨岩", hex: "#475569" },
] as const;

const THEME_STORAGE_KEY = "r2-kb-theme";
const ACCENT_STORAGE_KEY = "r2-kb-accent";
const ACCENT_VARS_CACHE_KEY = "r2-kb-accent-vars";

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

interface HslColor {
  h: number;
  s: number;
  l: number;
}

const LIGHT_HEATMAP_BASE: RgbColor = { r: 234, g: 231, b: 223 }; // #eae7df
const DARK_HEATMAP_BASE: RgbColor = { r: 34, g: 38, b: 48 }; // #222630

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeHexColor(input: string): string | null {
  const trimmed = input.trim();
  const shortMatch = /^#?([0-9a-fA-F]{3})$/.exec(trimmed);
  if (shortMatch) {
    const [r, g, b] = shortMatch[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  const fullMatch = /^#?([0-9a-fA-F]{6})$/.exec(trimmed);
  if (fullMatch) {
    return `#${fullMatch[1].toLowerCase()}`;
  }
  return null;
}

export function isValidHexColor(input: string): boolean {
  return normalizeHexColor(input) !== null;
}

export function hexToRgb(hex: string): RgbColor {
  const normalized = normalizeHexColor(hex) || "#6b4eff";
  const num = parseInt(normalized.slice(1), 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function rgbToHex({ r, g, b }: RgbColor): string {
  const toHex = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function rgbToHsl({ r, g, b }: RgbColor): HslColor {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) {
    return { h: 0, s: 0, l };
  }

  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let h = 0;
  if (max === rn) {
    h = ((gn - bn) / delta + (gn < bn ? 6 : 0)) / 6;
  } else if (max === gn) {
    h = ((bn - rn) / delta + 2) / 6;
  } else {
    h = ((rn - gn) / delta + 4) / 6;
  }

  return { h: h * 360, s, l };
}

export function hslToRgb({ h, s, l }: HslColor): RgbColor {
  const hn = (((h % 360) + 360) % 360) / 360;
  const sn = clamp(s, 0, 1);
  const ln = clamp(l, 0, 1);

  if (sn === 0) {
    const v = Math.round(ln * 255);
    return { r: v, g: v, b: v };
  }

  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
  const p = 2 * ln - q;
  const hue2rgb = (t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  return {
    r: Math.round(hue2rgb(hn + 1 / 3) * 255),
    g: Math.round(hue2rgb(hn) * 255),
    b: Math.round(hue2rgb(hn - 1 / 3) * 255),
  };
}

export function hslToHex(hsl: HslColor): string {
  return rgbToHex(hslToRgb(hsl));
}

function mixRgb(a: RgbColor, b: RgbColor, weightA: number): RgbColor {
  const w = clamp(weightA, 0, 1);
  return {
    r: Math.round(a.r * w + b.r * (1 - w)),
    g: Math.round(a.g * w + b.g * (1 - w)),
    b: Math.round(a.b * w + b.b * (1 - w)),
  };
}

function getRelativeLuminance({ r, g, b }: RgbColor): number {
  const linearize = (channel: number) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

export function getReadableOnAccentColor(accentHex: string): "#ffffff" | "#111827" {
  const lum = getRelativeLuminance(hexToRgb(accentHex));
  return lum > 0.44 ? "#111827" : "#ffffff";
}

export function findAccentPreset(pref: AccentPreference): AccentPreset | undefined {
  return ACCENT_PRESETS.find((preset) => preset.id === pref);
}

export function resolveAccentHex(pref: AccentPreference): string {
  const preset = findAccentPreset(pref);
  if (preset) return preset.hex;
  const normalized = normalizeHexColor(pref);
  if (normalized) return normalized;
  return ACCENT_PRESETS[0].hex;
}

export function computeAccentTokens(
  pref: AccentPreference,
  resolvedTheme: ResolvedTheme
): Record<string, string> {
  const baseHex = resolveAccentHex(pref);
  const baseRgb = hexToRgb(baseHex);
  const baseHsl = rgbToHsl(baseRgb);

  if (resolvedTheme === "light") {
    const accentHex = baseHex;
    const accentRgb = baseRgb;
    const accentHoverHex = hslToHex({
      h: baseHsl.h,
      s: clamp(baseHsl.s * 1.04, 0, 1),
      l: clamp(baseHsl.l - 0.075, 0.14, 0.82),
    });
    const textAccentHex = hslToHex({
      h: baseHsl.h,
      s: clamp(baseHsl.s, 0, 1),
      l: Math.min(baseHsl.l, 0.44),
    });
    const heatPeakRgb =
      baseHsl.l > 0.62
        ? hslToRgb({ h: baseHsl.h, s: baseHsl.s, l: 0.48 })
        : accentRgb;

    return {
      "--accent": accentHex,
      "--accent-hover": accentHoverHex,
      "--text-accent": textAccentHex,
      "--text-on-accent": getReadableOnAccentColor(accentHex),
      "--bg-active": `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.11)`,
      "--bg-inline-code": `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.08)`,
      "--accent-ring": `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.2)`,
      "--accent-soft": `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.08)`,
      "--heatmap-1": rgbToHex(mixRgb(heatPeakRgb, LIGHT_HEATMAP_BASE, 0.24)),
      "--heatmap-2": rgbToHex(mixRgb(heatPeakRgb, LIGHT_HEATMAP_BASE, 0.48)),
      "--heatmap-3": rgbToHex(mixRgb(heatPeakRgb, LIGHT_HEATMAP_BASE, 0.74)),
      "--heatmap-4": rgbToHex(heatPeakRgb),
    };
  }

  // Dark mode: lift dark colors smoothly so controls, text links, and heatmap cells remain crisp
  const darkL = clamp(Math.max(baseHsl.l + 0.14, 0.6), 0.56, 0.74);
  const darkS = baseHsl.s < 0.18 ? clamp(baseHsl.s * 1.1, 0, 0.28) : clamp(baseHsl.s * 0.96, 0.35, 0.92);
  const darkAccentRgb = hslToRgb({ h: baseHsl.h, s: darkS, l: darkL });
  const darkAccentHex = rgbToHex(darkAccentRgb);
  const darkHoverHex = hslToHex({
    h: baseHsl.h,
    s: darkS,
    l: clamp(darkL - 0.06, 0.48, 0.72),
  });
  const darkTextAccentHex = hslToHex({
    h: baseHsl.h,
    s: darkS,
    l: clamp(darkL + 0.08, 0.66, 0.82),
  });

  return {
    "--accent": darkAccentHex,
    "--accent-hover": darkHoverHex,
    "--text-accent": darkTextAccentHex,
    "--text-on-accent": getReadableOnAccentColor(darkAccentHex),
    "--bg-active": `rgba(${darkAccentRgb.r}, ${darkAccentRgb.g}, ${darkAccentRgb.b}, 0.17)`,
    "--bg-inline-code": `rgba(${darkAccentRgb.r}, ${darkAccentRgb.g}, ${darkAccentRgb.b}, 0.14)`,
    "--accent-ring": `rgba(${darkAccentRgb.r}, ${darkAccentRgb.g}, ${darkAccentRgb.b}, 0.28)`,
    "--accent-soft": `rgba(${darkAccentRgb.r}, ${darkAccentRgb.g}, ${darkAccentRgb.b}, 0.11)`,
    "--heatmap-1": rgbToHex(mixRgb(darkAccentRgb, DARK_HEATMAP_BASE, 0.26)),
    "--heatmap-2": rgbToHex(mixRgb(darkAccentRgb, DARK_HEATMAP_BASE, 0.5)),
    "--heatmap-3": rgbToHex(mixRgb(darkAccentRgb, DARK_HEATMAP_BASE, 0.76)),
    "--heatmap-4": darkAccentHex,
  };
}

export function getSavedThemePreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") {
      return raw;
    }
  } catch {
    // Ignore storage access failures in private browsing modes
  }
  return "system";
}

export function getSavedAccentPreference(): AccentPreference {
  try {
    const raw = localStorage.getItem(ACCENT_STORAGE_KEY);
    if (raw) {
      if (findAccentPreset(raw)) return raw;
      const normalized = normalizeHexColor(raw);
      if (normalized) return normalized;
    }
  } catch {
    // Ignore storage access failures
  }
  return DEFAULT_ACCENT_ID;
}

export function resolveTheme(pref: ThemePreference): ResolvedTheme {
  if (pref === "light" || pref === "dark") return pref;
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

export function applyAccentPreference(
  accent: AccentPreference,
  resolvedTheme: ResolvedTheme
): Record<string, string> {
  const safeAccent = findAccentPreset(accent)
    ? accent
    : normalizeHexColor(accent) || DEFAULT_ACCENT_ID;
  const tokens = computeAccentTokens(safeAccent, resolvedTheme);

  if (typeof document !== "undefined") {
    const rootStyle = document.documentElement.style;
    for (const [key, value] of Object.entries(tokens)) {
      rootStyle.setProperty(key, value);
    }
    document.documentElement.dataset.accent = safeAccent;
  }

  try {
    localStorage.setItem(ACCENT_STORAGE_KEY, safeAccent);
    const cache = {
      light: computeAccentTokens(safeAccent, "light"),
      dark: computeAccentTokens(safeAccent, "dark"),
    };
    localStorage.setItem(ACCENT_VARS_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore storage write errors
  }

  return tokens;
}

export function applyThemePreference(
  pref: ThemePreference,
  accent: AccentPreference = getSavedAccentPreference()
): ResolvedTheme {
  const resolved = resolveTheme(pref);
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = resolved;
  }
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // Ignore storage write errors
  }
  applyAccentPreference(accent, resolved);
  return resolved;
}

export function cycleThemePreference(current: ThemePreference): ThemePreference {
  if (current === "system") return "light";
  if (current === "light") return "dark";
  return "system";
}
