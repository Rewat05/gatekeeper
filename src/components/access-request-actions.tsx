"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

export function AccessRequestActions({ requestId }: { requestId: string }) {
  const router = useRouter()
  const [expiresAt, setExpiresAt] = useState("")
  const [loading, setLoading] = useState<"approve" | "deny" | null>(null)
  const [error, setError] = useState("")

  async function handleAction(action: "approve" | "deny") {
    setError("")
    setLoading(action)
    const res = await fetch(`/api/access-requests/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        expiresAt:
          action === "approve" && expiresAt ? new Date(expiresAt).toISOString() : undefined,
      }),
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
      <input
        type="date"
        value={expiresAt}
        onChange={(e) => setExpiresAt(e.target.value)}
        min={new Date().toISOString().split("T")[0]}
        title="Grant expiry (defaults to 7 days if left blank)"
        className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <Button size="sm" disabled={loading !== null} onClick={() => handleAction("approve")}>
        {loading === "approve" ? "Approving…" : "Approve"}
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={loading !== null}
        onClick={() => handleAction("deny")}
      >
        {loading === "deny" ? "Denying…" : "Deny"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
