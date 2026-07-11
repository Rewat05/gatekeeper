/**
 * Single source of truth for available color themes. Each entry here must have a
 * matching `[data-color-theme="<id>"]` block (light) and
 * `[data-color-theme="<id>"].dark` block (dark) in globals.css defining
 * --brand-primary/--brand-secondary/--brand-accent. Adding a theme is exactly
 * those two additions — nothing else in the app needs to change.
 */
export type ColorThemeId = "ledger" | "obsidian" | "moss"

export interface ColorTheme {
  id: ColorThemeId
  label: string
  description: string
}

export const COLOR_THEMES: ColorTheme[] = [
  { id: "ledger", label: "Ledger", description: "Graphite, indigo, and amber." },
  { id: "obsidian", label: "Obsidian", description: "Near-black, vault-green, and brass gold." },
  { id: "moss", label: "Moss", description: "Forest charcoal, sage, and terracotta." },
]

export const DEFAULT_COLOR_THEME: ColorThemeId = "ledger"

export const COLOR_THEME_STORAGE_KEY = "gatekeeper-color-theme"

export function isColorThemeId(value: string | null): value is ColorThemeId {
  return COLOR_THEMES.some((t) => t.id === value)
}
