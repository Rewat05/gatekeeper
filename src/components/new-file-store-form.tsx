"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"

const CLASSIFICATIONS = [
  { value: "Public",       desc: "Visible to all org members" },
  { value: "Internal",     desc: "Visible to department members" },
  { value: "Confidential", desc: "Requires explicit grant" },
  { value: "Restricted",   desc: "Requires explicit grant — highest protection" },
]

type Department = { id: string; name: string }

export function NewFileStoreForm({
  departments,
  callerRole,
  callerDeptId,
  callerDeptName,
}: {
  departments: Department[]
  callerRole: string
  callerDeptId: string | null
  callerDeptName: string | null
}) {
  const router = useRouter()
  const isManager = callerRole === "Manager"
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [classification, setClassification] = useState("Internal")
  const [departmentIds, setDepartmentIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  function toggleDepartment(id: string) {
    setDepartmentIds((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    const res = await fetch("/api/file-stores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description: description || undefined,
        classification: isManager ? "Internal" : classification,
        departmentIds: isManager ? (callerDeptId ? [callerDeptId] : []) : departmentIds,
      }),
    })

    setLoading(false)

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? "Failed to create file store.")
      return
    }

    const { id } = await res.json()
    router.push(`/file-stores/${id}`)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Q4 Finance Reports"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">
          Description{" "}
          <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <Input
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Quarterly financial statements and forecasts"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="classification">Classification</Label>
        {isManager ? (
          <p className="text-sm text-muted-foreground rounded-md border border-input bg-muted/50 px-3 py-2">
            Internal — Managers can only create department-scoped stores
          </p>
        ) : (
          <select
            id="classification"
            value={classification}
            onChange={(e) => setClassification(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {CLASSIFICATIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.value} — {c.desc}
              </option>
            ))}
          </select>
        )}
      </div>

      {isManager ? (
        <div className="space-y-2">
          <Label>Department</Label>
          <p className="text-sm text-muted-foreground rounded-md border border-input bg-muted/50 px-3 py-2">
            {callerDeptName ?? "No department assigned"}
          </p>
        </div>
      ) : (
        departments.length > 0 && (
          <div className="space-y-2">
            <Label>
              Departments{" "}
              <span className="text-muted-foreground font-normal">
                (optional — leave unchecked for org-wide)
              </span>
            </Label>
            <div className="space-y-1.5 rounded-md border border-input p-3">
              {departments.map((d) => (
                <label key={d.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={departmentIds.includes(d.id)}
                    onChange={() => toggleDepartment(d.id)}
                    className="size-3.5 rounded border-input"
                  />
                  {d.name}
                </label>
              ))}
            </div>
          </div>
        )
      )}

      <div className="flex gap-3 pt-1">
        <Button type="submit" disabled={loading || (isManager && !callerDeptId)}>
          {loading ? "Creating…" : "Create file store"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
