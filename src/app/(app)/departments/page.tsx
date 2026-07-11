import { headers } from "next/headers"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Plus, Pencil } from "lucide-react"
import { auth } from "@/lib/auth"
import { createSupabaseServiceClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { DeleteDepartmentButton } from "@/components/delete-department-button"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"

type RawDept = {
  id: string
  name: string
  description: string | null
  manager_id: string | null
}

type UserRecord = { id: string; name: string | null; email: string }

export default async function DepartmentsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/auth/login")

  const supabase = createSupabaseServiceClient()

  const { data: caller } = await supabase
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", session.user.id)
    .eq("status", "Active")
    .maybeSingle()

  if (!caller) redirect("/onboarding")
  if (!["Owner", "Admin"].includes(caller.role as string)) redirect("/dashboard")

  const orgId = caller.org_id as string

  const [{ data: rawDepts }, { data: memberRows }] = await Promise.all([
    supabase.from("departments").select("id, name, description, manager_id").eq("org_id", orgId).order("name"),
    supabase.from("org_members").select("department_id").eq("org_id", orgId).eq("status", "Active").not("department_id", "is", null),
  ])

  const depts = (rawDepts ?? []) as RawDept[]

  // Count members per department
  type MemberRow = { department_id: string }
  const countMap = new Map<string, number>()
  ;((memberRows ?? []) as MemberRow[]).forEach((row) => {
    countMap.set(row.department_id, (countMap.get(row.department_id) ?? 0) + 1)
  })

  // Fetch manager names
  const managerIds = [...new Set(depts.map((d) => d.manager_id).filter(Boolean))] as string[]
  let managers: UserRecord[] = []
  if (managerIds.length > 0) {
    const { data } = await supabase.from("user").select("id, name, email").in("id", managerIds)
    managers = (data ?? []) as UserRecord[]
  }
  const managerMap = new Map(managers.map((m) => [m.id, m]))

  return (
    <PageShell maxWidth="4xl">
      <PageHeader
        title="Departments"
        meta={<span className="text-sm text-muted-foreground">{depts.length} total</span>}
        actions={
          <Button asChild>
            <Link href="/departments/new">
              <Plus className="size-4" />
              New department
            </Link>
          </Button>
        }
      />

      {depts.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-sm font-medium">No departments yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Create departments to organise members and control access to Internal file stores.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Description</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Manager</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Members</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {depts.map((dept) => {
                const mgr = dept.manager_id ? managerMap.get(dept.manager_id) : null
                const memberCount = countMap.get(dept.id) ?? 0
                return (
                  <tr key={dept.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">{dept.name}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs max-w-xs">
                      {dept.description ? (
                        <span className="line-clamp-2">{dept.description}</span>
                      ) : (
                        <span className="italic">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {mgr ? (mgr.name ?? mgr.email) : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{memberCount}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/departments/${dept.id}/edit`}>
                            <Pencil className="size-3.5" />
                            Edit
                          </Link>
                        </Button>
                        <DeleteDepartmentButton departmentId={dept.id} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  )
}
