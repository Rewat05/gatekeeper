"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import Ferrofluid from "@/components/ferrofluid"

/**
 * Ambient page background — reads the Ledger brand colors straight from CSS custom
 * properties (never hardcoded) so it stays correct across light/dark mode automatically.
 */
export function FerrofluidBackground() {
  const { resolvedTheme } = useTheme()
  const [colors, setColors] = useState<string[] | null>(null)

  useEffect(() => {
    const style = getComputedStyle(document.documentElement)
    const secondary = style.getPropertyValue("--brand-secondary").trim()
    const accent = style.getPropertyValue("--brand-accent").trim()
    // Deliberately skips --brand-primary (graphite): this shader derives alpha from color
    // brightness, so a dark color there would render as near-invisible regardless of glow —
    // secondary/accent are the two Ledger colors bright enough for this effect to show up.
    // getComputedStyle needs the DOM, so this can only be read client-side post-mount —
    // there's no render-time value to compute this from during SSR.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setColors([secondary, accent])
  }, [resolvedTheme])

  if (!colors) return null

  return (
    // No negative z-index here on purpose — WebGL canvases are often promoted to their own
    // GPU compositing layer, and negative z-index against that layer composites inconsistently
    // across browsers. Foreground content is pulled in front with a positive z-index instead
    // (see dashboard/page.tsx's `PageShell className="relative z-10"`).
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <Ferrofluid
        colors={colors}
        opacity={0.3}
        speed={0.15}
        scale={1.4}
        turbulence={0.6}
        fluidity={0.15}
        rimWidth={0.18}
        sharpness={2.5}
        shimmer={0.8}
        glow={2.5}
        flowDirection="down"
        mouseInteraction={false}
        dpr={1}
        frameSkip={2}
      />
    </div>
  )
}
