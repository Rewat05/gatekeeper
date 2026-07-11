"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

export function DeleteFileButton({ storeId, fileId }: { storeId: string; fileId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleDelete() {
    setError("")
    setLoading(true)
    const res = await fetch(`/api/file-stores/${storeId}/files/${fileId}`, {
      method: "DELETE",
    })
    setLoading(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError((data as { error?: string }).error ?? "Failed to delete.")
      return
    }
    router.refresh()
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="destructive" disabled={loading} onClick={handleDelete}>
        {loading ? "Deleting…" : "Delete"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
