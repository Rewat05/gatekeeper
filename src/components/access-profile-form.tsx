"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"

type Department = { id: string; name: string }
type FileStore = { id: string; name: string }
type StoreGrant = { fileStoreId: string; permission: "Read" | "Write" }

type Initial = {
  departmentName: string
  role: string
  storeGrants: StoreGrant[]
}

export function AccessProfileForm({
  mode,
  profileId,
  departments,
  fileStores,
  initial,
}: {
  mode: "create" | "edit"
  profileId?: string
  departments: Department[]
  fileStores: FileStore[]
  initial?: Initial
}) {
  const router = useRouter()
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "")
  const [role, setRole] = useState("Member")
  const [selected, setSelected] = useState<Record<string, "Read" | "Write">>(
    Object.fromEntries((initial?.storeGrants ?? []).map((g) => [g.fileStoreId, g.permission]))
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  function toggleStore(storeId: string, checked: boolean) {
    setSelected((prev) => {
      const next = { ...prev }
      if (checked) next[storeId] = next[storeId] ?? "Read"
      else delete next[storeId]
      return next
    })
  }

  function setPermission(storeId: string, permission: "Read" | "Write") {
    setSelected((prev) => ({ ...prev, [storeId]: permission }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    const storeGrants = Object.entries(selected).map(([fileStoreId, permission]) => ({
      fileStoreId,
      permission,
    }))

    const url = mode === "create" ? "/api/access-profiles" : `/api/access-profiles/${profileId}`
    const method = mode === "create" ? "POST" : "PATCH"
    const body =
      mode === "create" ? { departmentId, role, storeGrants } : { storeGrants }

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    setLoading(false)

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? "Something went wrong.")
      return
    }

    router.push("/access-profiles")
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-lg">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {mode === "create" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="profile-dept">Department</Label>
            <select
              id="profile-dept"
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              required
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-role">Role</Label>
            <select
              id="profile-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="Manager">Manager</option>
              <option value="Member">Member</option>
              <option value="Viewer">Viewer</option>
            </select>
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-input bg-muted/50 px-3 py-2 text-sm">
          {initial?.departmentName} · {initial?.role}
        </div>
      )}

      <div className="space-y-2">
        <Label>File stores</Label>
        <p className="text-xs text-muted-foreground">
          Members matching this department + role are automatically granted the selected
          permission for each store checked below. Unchecking a store revokes access it
          previously granted.
        </p>
        {fileStores.length === 0 ? (
          <p className="text-sm text-muted-foreground">No file stores in this org yet.</p>
        ) : (
          <div className="space-y-1.5 rounded-md border border-input p-3 max-h-72 overflow-y-auto">
            {fileStores.map((store) => {
              const permission = selected[store.id]
              const checked = permission !== undefined
              return (
                <div key={store.id} className="flex items-center gap-3 text-sm">
                  <label className="flex items-center gap-2 flex-1">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => toggleStore(store.id, e.target.checked)}
                      className="size-3.5 rounded border-input"
                    />
                    {store.name}
                  </label>
                  <select
                    value={permission ?? "Read"}
                    onChange={(e) => setPermission(store.id, e.target.value as "Read" | "Write")}
                    disabled={!checked}
                    className="h-7 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                  >
                    <option value="Read">Read</option>
                    <option value="Write">Write</option>
                  </select>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading
            ? mode === "create"
              ? "Creating…"
              : "Saving…"
            : mode === "create"
              ? "Create profile"
              : "Save changes"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/access-profiles")}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
