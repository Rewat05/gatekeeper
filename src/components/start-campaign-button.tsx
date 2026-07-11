"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

export function StartCampaignButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleStart() {
    setError("")
    setLoading(true)
    const res = await fetch("/api/review-campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    setLoading(false)
    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? "Something went wrong.")
      return
    }
    router.refresh()
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" disabled={loading} onClick={handleStart}>
        {loading ? "Starting…" : "Start review campaign"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
