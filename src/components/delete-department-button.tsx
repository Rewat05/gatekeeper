"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

export function DeleteDepartmentButton({ departmentId }: { departmentId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    if (!confirm("Delete this department? Members will lose their department assignment.")) return
    setLoading(true)
    const res = await fetch(`/api/departments/${departmentId}`, { method: "DELETE" })
    setLoading(false)
    if (!res.ok) {
      const data = await res.json()
      alert(data.error ?? "Failed to delete department.")
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
