export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "r2-kb-theme";

export function getSavedThemePreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") {
      return raw;
    }
  } catch {
    // Ignore storage access failures in private browsing modes
  }
  return "system";
}

export function resolveTheme(pref: ThemePreference): ResolvedTheme {
  if (pref === "light" || pref === "dark") return pref;
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

export function applyThemePreference(pref: ThemePreference): ResolvedTheme {
  const resolved = resolveTheme(pref);
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = resolved;
  }
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // Ignore storage write errors
  }
  return resolved;
}

export function cycleThemePreference(current: ThemePreference): ThemePreference {
  if (current === "system") return "light";
  if (current === "light") return "dark";
  return "system";
}
