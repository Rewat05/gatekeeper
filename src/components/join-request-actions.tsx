"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

export function JoinRequestActions({ requestId }: { requestId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState<"approve" | "deny" | null>(null)
  const [error, setError] = useState("")

  async function handleAction(action: "approve" | "deny") {
    setError("")
    setLoading(action)
    const res = await fetch(`/api/join-requests/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
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
      <Button
        size="sm"
        disabled={loading !== null}
        onClick={() => handleAction("approve")}
      >
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
