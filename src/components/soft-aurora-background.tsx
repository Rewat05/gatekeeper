"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import SoftAurora from "@/components/soft-aurora"

/**
 * Ambient page background — reads the Ledger brand colors straight from CSS custom
 * properties (never hardcoded) so it stays correct across light/dark mode automatically.
 */
export function SoftAuroraBackground() {
  const { resolvedTheme } = useTheme()
  const [colors, setColors] = useState<{ color1: string; color2: string } | null>(null)

  useEffect(() => {
    const style = getComputedStyle(document.documentElement)
    const accent = style.getPropertyValue("--brand-accent").trim()
    // This shader additively blends color1 + color2 at every pixel, so using two
    // near-complementary Ledger hues (indigo + amber) neutralizes into muddy brown/gray
    // instead of staying vibrant. Using the same accent color for both layers keeps it
    // a clean, recognizably-branded amber glow — still purely a theme color, not a new one.
    // getComputedStyle needs the DOM, so this can only be read client-side post-mount —
    // there's no render-time value to compute this from during SSR.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setColors({ color1: accent, color2: accent })
  }, [resolvedTheme])

  if (!colors) return null

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <SoftAurora
        color1={colors.color1}
        color2={colors.color2}
        speed={0.4}
        scale={1.5}
        brightness={1.2}
        noiseFrequency={2.5}
        noiseAmplitude={1.0}
        bandHeight={0.5}
        bandSpread={1.0}
        octaveDecay={0.1}
        colorSpeed={0.6}
        enableMouseInteraction={false}
      />
    </div>
  )
}
