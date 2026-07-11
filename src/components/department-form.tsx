"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Member = { id: string; name: string | null; email: string }

type Initial = {
  name: string
  description: string | null
  managerId: string | null
}

export function DepartmentForm({
  members,
  mode,
  initial,
  departmentId,
}: {
  members: Member[]
  mode: "create" | "edit"
  initial?: Initial
  departmentId?: string
}) {
  const router = useRouter()
  const [name, setName] = useState(initial?.name ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [managerId, setManagerId] = useState(initial?.managerId ?? "")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    const url = mode === "create" ? "/api/departments" : `/api/departments/${departmentId}`
    const method = mode === "create" ? "POST" : "PATCH"

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        description: description.trim() || undefined,
        managerId: managerId || null,
      }),
    })

    setLoading(false)

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? "Something went wrong.")
      return
    }

    router.push("/departments")
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-md">
      <div className="space-y-1.5">
        <Label htmlFor="dept-name">Name</Label>
        <Input
          id="dept-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Engineering"
          required
          maxLength={100}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="dept-desc">Description</Label>
        <Input
          id="dept-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="dept-manager">Manager</Label>
        <select
          id="dept-manager"
          value={managerId}
          onChange={(e) => setManagerId(e.target.value)}
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">No manager</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name ?? m.email} {m.name ? `(${m.email})` : ""}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading
            ? mode === "create"
              ? "Creating…"
              : "Saving…"
            : mode === "create"
              ? "Create department"
              : "Save changes"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/departments")}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
