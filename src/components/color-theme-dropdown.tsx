"use client"

import { Check, Palette } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { COLOR_THEMES } from "@/lib/color-themes"
import { useColorTheme } from "@/components/color-theme-provider"
import { cn } from "@/lib/utils"

export function ColorThemeDropdown() {
  const { colorTheme, setColorTheme } = useColorTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm">
          <Palette />
          <span className="sr-only">Change color theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        {COLOR_THEMES.map(({ id, label, description }) => (
          <DropdownMenuItem key={id} onClick={() => setColorTheme(id)}>
            <span
              className="size-3.5 rounded-full shrink-0 ring-1 ring-black/10"
              style={{ background: `var(--color-theme-swatch-${id})` }}
              aria-hidden="true"
            />
            <span className="flex flex-col">
              <span>{label}</span>
              <span className="text-xs text-muted-foreground">{description}</span>
            </span>
            <Check className={cn("ml-auto size-3.5 shrink-0", colorTheme !== id && "opacity-0")} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
