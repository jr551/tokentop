import { useKeyboard } from "@opentui/react";
import { useEffect, useMemo, useState } from "react";
import type { ColorSchemePreference, ThemePlugin } from "@/plugins/types/theme.ts";
import { useColors } from "../contexts/ThemeContext.tsx";

interface ThemePickerProps {
  themes: ThemePlugin[];
  currentThemeId: string;
  currentScheme: ColorSchemePreference;
  onSelect: (themeId: string, scheme: ColorSchemePreference) => void;
  onPreview: (theme: ThemePlugin | null) => void;
  onCancel: () => void;
}

type ThemeItem = { type: "header"; label: string } | { type: "theme"; theme: ThemePlugin };

export function ThemePicker({
  themes,
  currentThemeId,
  currentScheme,
  onSelect,
  onPreview,
  onCancel,
}: ThemePickerProps) {
  const colors = useColors();
  const [scheme, setScheme] = useState<ColorSchemePreference>(currentScheme);
  const [focusPane, setFocusPane] = useState<"scheme" | "list">("list");
  const [focusedIndex, setFocusedIndex] = useState(0);

  // Filter and group themes based on selected scheme
  const listItems = useMemo<ThemeItem[]>(() => {
    const darkThemes = themes.filter((t) => t.colorScheme === "dark");
    const lightThemes = themes.filter((t) => t.colorScheme === "light");

    if (scheme === "dark") {
      return darkThemes.map((t) => ({ type: "theme", theme: t }));
    }
    if (scheme === "light") {
      return lightThemes.map((t) => ({ type: "theme", theme: t }));
    }
    // Auto: Show both with headers
    return [
      { type: "header", label: "DARK" },
      ...darkThemes.map((t) => ({ type: "theme", theme: t }) as const),
      { type: "header", label: "LIGHT" },
      ...lightThemes.map((t) => ({ type: "theme", theme: t }) as const),
    ];
  }, [themes, scheme]);

  // Find initial index for current theme
  useEffect(() => {
    const idx = listItems.findIndex(
      (item) => item.type === "theme" && item.theme.id === currentThemeId,
    );
    if (idx >= 0) {
      setFocusedIndex(idx);
    } else {
      // If not found (e.g. switched scheme and current theme is hidden), select first theme
      const firstThemeIdx = listItems.findIndex((item) => item.type === "theme");
      if (firstThemeIdx >= 0) setFocusedIndex(firstThemeIdx);
    }
  }, [currentThemeId, listItems]);

  // Scroll calculation
  const visibleCount = 10;
  const scrollOffset = useMemo(() => {
    if (listItems.length <= visibleCount) return 0;
    if (focusedIndex < visibleCount - 1) return 0;
    const maxOffset = listItems.length - visibleCount;
    return Math.min(focusedIndex - visibleCount + 2, maxOffset);
  }, [focusedIndex, listItems.length, visibleCount]);

  const visibleItems = listItems.slice(scrollOffset, scrollOffset + visibleCount);
  const hasMoreAbove = scrollOffset > 0;
  const hasMoreBelow = scrollOffset + visibleCount < listItems.length;

  useKeyboard((key) => {
    if (key.name === "escape") {
      onCancel();
      return;
    }

    if (key.name === "tab") {
      setFocusPane((p) => (p === "scheme" ? "list" : "scheme"));
      return;
    }

    if (focusPane === "scheme") {
      if (key.name === "left" || key.name === "h" || key.name === "right" || key.name === "l") {
        const schemes: ColorSchemePreference[] = ["auto", "dark", "light"];
        const currentIdx = schemes.indexOf(scheme);
        const direction = key.name === "left" || key.name === "h" ? -1 : 1;
        const nextIdx = (currentIdx + direction + schemes.length) % schemes.length;
        const newScheme = schemes[nextIdx]!;
        setScheme(newScheme);

        // Preview first theme of new scheme
        const darkThemes = themes.filter((t) => t.colorScheme === "dark");
        const lightThemes = themes.filter((t) => t.colorScheme === "light");
        let nextTheme: ThemePlugin | undefined;

        if (newScheme === "dark") nextTheme = darkThemes[0];
        else if (newScheme === "light") nextTheme = lightThemes[0];
        else nextTheme = darkThemes[0]; // Auto defaults to dark usually

        if (nextTheme) {
          onPreview(nextTheme);
        }
      } else if (key.name === "down" || key.name === "j") {
        setFocusPane("list");
      }
      return;
    }

    if (focusPane === "list") {
      if (key.name === "up" || key.name === "k") {
        let nextIdx = focusedIndex - 1;
        // Skip headers going up
        while (nextIdx >= 0 && listItems[nextIdx]?.type === "header") {
          nextIdx--;
        }
        if (nextIdx >= 0) {
          setFocusedIndex(nextIdx);
          const item = listItems[nextIdx];
          if (item?.type === "theme") onPreview(item.theme);
        } else {
          setFocusPane("scheme");
        }
      } else if (key.name === "down" || key.name === "j") {
        let nextIdx = focusedIndex + 1;
        // Skip headers going down
        while (nextIdx < listItems.length && listItems[nextIdx]?.type === "header") {
          nextIdx++;
        }
        if (nextIdx < listItems.length) {
          setFocusedIndex(nextIdx);
          const item = listItems[nextIdx];
          if (item?.type === "theme") onPreview(item.theme);
        }
      } else if (key.name === "return") {
        const item = listItems[focusedIndex];
        if (item?.type === "theme") {
          onSelect(item.theme.id, scheme);
        }
      }
    }
  });

  return (
    <box flexDirection="column" flexGrow={1} padding={1}>
      {/* Section 1: Scheme Selector */}
      <box flexDirection="row" justifyContent="center" marginBottom={1} height={1}>
        {(["auto", "dark", "light"] as const).map((s) => {
          const isActive = scheme === s;
          const isFocused = focusPane === "scheme";
          return (
            <box key={s} marginRight={1}>
              <text
                {...(isActive ? { bg: colors.primary } : {})}
                fg={isActive ? colors.background : isFocused ? colors.text : colors.textMuted}
              >
                {isFocused && isActive ? "▸ " : "  "}
                {s.charAt(0).toUpperCase() + s.slice(1)}
                {isFocused && isActive ? " ◂" : "  "}
              </text>
            </box>
          );
        })}
      </box>

      {/* Section 2: Theme List */}
      <box flexDirection="column" flexGrow={1} overflow="hidden">
        <box flexDirection="row" justifyContent="space-between" marginBottom={0} height={1}>
          <text fg={colors.textMuted}>THEMES</text>
          {(hasMoreAbove || hasMoreBelow) && (
            <text fg={colors.textSubtle}>
              {hasMoreAbove ? "▲" : " "}
              {hasMoreBelow ? "▼" : " "}
            </text>
          )}
        </box>

        {visibleItems.map((item, idx) => {
          const realIndex = scrollOffset + idx;
          const isFocused = realIndex === focusedIndex && focusPane === "list";

          if (item.type === "header") {
            return (
              <box key={`header-${realIndex}`} height={1} marginTop={1} marginBottom={0}>
                <text fg={colors.textSubtle}>
                  <strong>{item.label}</strong>
                </text>
              </box>
            );
          }

          const theme = item.theme;
          const isActive = theme.id === currentThemeId;

          return (
            <box
              key={theme.id}
              flexDirection="row"
              height={1}
              paddingX={1}
              {...(isFocused ? { backgroundColor: colors.primary } : {})}
            >
              <text fg={isFocused ? colors.background : colors.primary}>
                {isFocused ? "▸ " : "  "}
              </text>

              <box width={20}>
                <text fg={isFocused ? colors.background : colors.text}>{theme.name}</text>
              </box>

              <box flexDirection="row" gap={1}>
                <text bg={theme.colors.background}> </text>
                <text bg={theme.colors.primary}> </text>
                <text bg={theme.colors.secondary}> </text>
                <text bg={theme.colors.success}> </text>
                <text bg={theme.colors.error}> </text>
              </box>

              {isActive && (
                <box marginLeft={2}>
                  <text fg={isFocused ? colors.background : colors.textMuted}>(active)</text>
                </box>
              )}
            </box>
          );
        })}
      </box>
    </box>
  );
}
