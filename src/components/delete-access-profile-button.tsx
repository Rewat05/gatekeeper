"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

export function DeleteAccessProfileButton({ profileId }: { profileId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    if (
      !confirm(
        "Delete this access profile? Any grants it auto-provisioned will be revoked."
      )
    )
      return
    setLoading(true)
    const res = await fetch(`/api/access-profiles/${profileId}`, { method: "DELETE" })
    setLoading(false)
    if (!res.ok) {
      const data = await res.json()
      alert(data.error ?? "Failed to delete profile.")
      return
    }
    router.refresh()
  }

  return (
    <Button size="sm" variant="destructive" disabled={loading} onClick={handleDelete}>
      {loading ? "Deleting…" : "Delete"}
    </Button>
  )
}
