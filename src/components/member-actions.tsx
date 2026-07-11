"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

const ROLES_FOR_OWNER = ["Owner", "Admin", "Manager", "Member", "Viewer"]
const ROLES_FOR_ADMIN = ["Manager", "Member", "Viewer"]

export function MemberActions({
  memberId,
  currentRole,
  currentStatus,
  currentDeptId,
  callerRole,
  departments,
}: {
  memberId: string
  currentRole: string
  currentStatus: string
  currentDeptId: string | null
  callerRole: string
  departments: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [role, setRole] = useState(currentRole)
  const [suspended, setSuspended] = useState(currentStatus === "Suspended")
  const [deptId, setDeptId] = useState(currentDeptId ?? "")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const roles = callerRole === "Owner" ? ROLES_FOR_OWNER : ROLES_FOR_ADMIN
  const isAdminRole = role === "Owner" || role === "Admin"

  async function patch(body: object): Promise<boolean> {
    setError("")
    setLoading(true)
    const res = await fetch(`/api/members/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    setLoading(false)
    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? "Update failed.")
      return false
    }
    router.refresh()
    return true
  }

  async function handleRoleChange(newRole: string) {
    const prev = role
    const prevDeptId = deptId
    setRole(newRole)
    // Owners/Admins never belong to a department — mirror the server-side clear immediately.
    if (newRole === "Owner" || newRole === "Admin") setDeptId("")
    const ok = await patch({ role: newRole })
    if (!ok) {
      setRole(prev)
      setDeptId(prevDeptId)
    }
  }

  async function handleStatusToggle() {
    const newSuspended = !suspended
    setSuspended(newSuspended)
    const ok = await patch({ status: newSuspended ? "Suspended" : "Active" })
    if (!ok) setSuspended(!newSuspended)
  }

  async function handleDeptChange(newDeptId: string) {
    const prev = deptId
    setDeptId(newDeptId)
    const ok = await patch({ departmentId: newDeptId || null })
    if (!ok) setDeptId(prev)
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        value={isAdminRole ? "" : deptId}
        onChange={(e) => handleDeptChange(e.target.value)}
        disabled={loading || isAdminRole}
        title={isAdminRole ? "Owners and Admins don't belong to a department" : undefined}
        className="h-7 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
      >
        <option value="">No dept</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>

      <select
        value={role}
        onChange={(e) => handleRoleChange(e.target.value)}
        disabled={loading}
        className="h-7 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
      >
        {roles.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>

      <Button
        size="sm"
        variant={suspended ? "outline" : "destructive"}
        disabled={loading}
        onClick={handleStatusToggle}
      >
        {suspended ? "Activate" : "Suspend"}
      </Button>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
