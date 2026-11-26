import { useEffect, useRef, useState } from "react";
import { Check, Monitor, Moon, Palette, RotateCcw, Sun } from "lucide-react";
import {
  ACCENT_PRESETS,
  DEFAULT_ACCENT_ID,
  findAccentPreset,
  normalizeHexColor,
  resolveAccentHex,
  type AccentPreference,
  type ThemePreference,
} from "../lib/theme";

interface AppearancePopoverProps {
  themePref: ThemePreference;
  accentPref: AccentPreference;
  onChangeTheme: (pref: ThemePreference) => void;
  onChangeAccent: (accent: AccentPreference) => void;
}

const MODE_OPTIONS: Array<{
  value: ThemePreference;
  label: string;
  Icon: typeof Monitor;
}> = [
  { value: "system", label: "系统", Icon: Monitor },
  { value: "light", label: "浅色", Icon: Sun },
  { value: "dark", label: "深色", Icon: Moon },
];

export function AppearancePopover({
  themePref,
  accentPref,
  onChangeTheme,
  onChangeAccent,
}: AppearancePopoverProps) {
  const [open, setOpen] = useState(false);
  const resolvedHex = resolveAccentHex(accentPref);
  const [hexInput, setHexInput] = useState(resolvedHex);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setHexInput(resolveAccentHex(accentPref));
  }, [accentPref]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const activePreset = findAccentPreset(accentPref);
  const isCustomHex = !activePreset;
  const isDefault = accentPref === DEFAULT_ACCENT_ID;

  const handleHexTextChange = (raw: string) => {
    setHexInput(raw);
    const normalized = normalizeHexColor(raw);
    if (normalized) {
      onChangeAccent(normalized);
    }
  };

  const handleHexBlur = () => {
    const normalized = normalizeHexColor(hexInput);
    if (normalized) {
      setHexInput(normalized);
      onChangeAccent(normalized);
    } else {
      setHexInput(resolveAccentHex(accentPref));
    }
  };

  return (
    <div className="appearance-wrap" ref={containerRef}>
      <button
        type="button"
        className={`icon-btn appearance-trigger ${open ? "is-active" : ""}`}
        onClick={() => setOpen((v) => !v)}
        title="外观与主题色设置"
        aria-label="外观与主题色设置"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Palette size={18} />
        <span
          className="appearance-trigger-dot"
          style={{ backgroundColor: "var(--accent)" }}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="appearance-popover" role="dialog" aria-label="外观与主题色设置">
          <div className="popover-section">
            <div className="popover-label">外观模式</div>
            <div className="mode-segmented" role="radiogroup" aria-label="外观模式">
              {MODE_OPTIONS.map(({ value, label, Icon }) => {
                const active = themePref === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`mode-segment-btn ${active ? "is-active" : ""}`}
                    onClick={() => onChangeTheme(value)}
                  >
                    <Icon size={14} />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="popover-divider" />

          <div className="popover-section">
            <div className="popover-label-row">
              <span className="popover-label">主题色</span>
              {!isDefault && (
                <button
                  type="button"
                  className="popover-reset-btn"
                  onClick={() => onChangeAccent(DEFAULT_ACCENT_ID)}
                  title="恢复默认主题色"
                >
                  <RotateCcw size={12} />
                  <span>恢复默认</span>
                </button>
              )}
            </div>

            <div className="accent-swatch-grid" role="radiogroup" aria-label="预设主题色">
              {ACCENT_PRESETS.map((preset) => {
                const selected = accentPref === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`accent-swatch-btn ${selected ? "is-selected" : ""}`}
                    onClick={() => onChangeAccent(preset.id)}
                    title={preset.name}
                    aria-label={`主题色：${preset.name}`}
                  >
                    <span
                      className="accent-swatch-circle"
                      style={{ backgroundColor: preset.hex }}
                    >
                      {selected && <Check size={13} strokeWidth={2.8} color="#ffffff" />}
                    </span>
                    <span className="accent-swatch-name">{preset.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="popover-section custom-color-section">
            <div className="popover-label">自定义色值</div>
            <div className="custom-color-row">
              <label className="custom-color-picker-wrap" title="选择任意颜色">
                <input
                  type="color"
                  className="custom-color-native"
                  value={resolvedHex}
                  onChange={(e) => onChangeAccent(e.target.value)}
                  aria-label="拾取自定义主题色"
                />
                <span
                  className={`custom-color-preview ${isCustomHex ? "is-selected" : ""}`}
                  style={{ backgroundColor: resolvedHex }}
                />
              </label>

              <input
                type="text"
                className="custom-hex-input"
                value={hexInput}
                onChange={(e) => handleHexTextChange(e.target.value)}
                onBlur={handleHexBlur}
                placeholder="#6b4eff"
                maxLength={7}
                spellCheck={false}
                aria-label="自定义十六进制色值"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
