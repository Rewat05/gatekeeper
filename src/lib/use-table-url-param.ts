"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback } from "react"

/**
 * Returns a function that navigates to the current path with the given params
 * overridden, preserving every other existing query param (including another
 * table's prefixed params on pages with more than one DataTable).
 */
export function useTableUrlParam() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  return useCallback(
    (overrides: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(overrides)) {
        if (value) {
          params.set(key, value)
        } else {
          params.delete(key)
        }
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [router, pathname, searchParams]
  )
}
