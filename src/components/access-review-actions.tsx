"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

export function AccessReviewActions({ reviewId }: { reviewId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState<"Certified" | "Revoked" | null>(null)
  const [error, setError] = useState("")

  async function handleDecide(decision: "Certified" | "Revoked") {
    setError("")
    setLoading(decision)
    const res = await fetch(`/api/access-reviews/${reviewId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    })
    setLoading(null)
    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? "Something went wrong.")
      return
    }
    router.refresh()
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" disabled={loading !== null} onClick={() => handleDecide("Certified")}>
        {loading === "Certified" ? "Certifying…" : "Certify"}
      </Button>
      <Button
        size="sm"
        variant="destructive"
        disabled={loading !== null}
        onClick={() => handleDecide("Revoked")}
      >
        {loading === "Revoked" ? "Revoking…" : "Revoke"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
