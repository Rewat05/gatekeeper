"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

export function RevokeGrantButton({
  storeId,
  grantId,
}: {
  storeId: string
  grantId: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleRevoke() {
    setError("")
    setLoading(true)
    const res = await fetch(`/api/file-stores/${storeId}/grants/${grantId}`, {
      method: "DELETE",
    })
    setLoading(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError((data as { error?: string }).error ?? "Failed to revoke.")
      return
    }
    router.refresh()
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="destructive" disabled={loading} onClick={handleRevoke}>
        {loading ? "Revoking…" : "Revoke"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
