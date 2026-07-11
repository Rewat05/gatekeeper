"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/**
 * Drops into a server-rendered page to periodically re-run its data fetch
 * via router.refresh() — for pages showing state that can change from
 * someone ELSE's action (an admin approving a request, etc.) while this
 * page just sits open with no click or navigation to trigger a re-fetch.
 */
export function AutoRefresh({ intervalMs = 15000 }: { intervalMs?: number }) {
  const router = useRouter()

  useEffect(() => {
    const interval = setInterval(() => router.refresh(), intervalMs)
    return () => clearInterval(interval)
  }, [router, intervalMs])

  return null
}
