"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"
import {
  COLOR_THEME_STORAGE_KEY,
  DEFAULT_COLOR_THEME,
  isColorThemeId,
  type ColorThemeId,
} from "@/lib/color-themes"

interface ColorThemeContextValue {
  colorTheme: ColorThemeId
  setColorTheme: (id: ColorThemeId) => void
}

const ColorThemeContext = createContext<ColorThemeContextValue | null>(null)

export function ColorThemeProvider({ children }: { children: React.ReactNode }) {
  const [colorTheme, setColorThemeState] = useState<ColorThemeId>(DEFAULT_COLOR_THEME)

  useEffect(() => {
    // The blocking script in the root <head> already set the DOM attribute before
    // paint (avoiding a flash) — this just syncs React state to match on mount.
    const stored = localStorage.getItem(COLOR_THEME_STORAGE_KEY)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setColorThemeState(isColorThemeId(stored) ? stored : DEFAULT_COLOR_THEME)
  }, [])

  const setColorTheme = useCallback((id: ColorThemeId) => {
    setColorThemeState(id)
    document.documentElement.setAttribute("data-color-theme", id)
    localStorage.setItem(COLOR_THEME_STORAGE_KEY, id)
  }, [])

  return (
    <ColorThemeContext.Provider value={{ colorTheme, setColorTheme }}>
      {children}
    </ColorThemeContext.Provider>
  )
}

export function useColorTheme() {
  const ctx = useContext(ColorThemeContext)
  if (!ctx) throw new Error("useColorTheme must be used within a ColorThemeProvider")
  return ctx
}
