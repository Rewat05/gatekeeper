import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { createSupabaseServiceClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { MemberActions } from "@/components/member-actions"
import { RemoveMemberButton } from "@/components/remove-member-button"
import { AnimatedTableRow } from "@/components/animated-table-row"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"
import { DataTable } from "@/components/data-table"
import { DataTableFilterSelect } from "@/components/data-table-filter-select"
import { SortableHeader } from "@/components/sortable-header"
import { parseTableParams, getRange, lookupIdsByText, PAGE_SIZE } from "@/lib/table-params"

type MemberRole = "Owner" | "Admin" | "Manager" | "Member" | "Viewer"
type MemberStatus = "Active" | "Suspended" | "Pending"

const SORTABLE_COLUMNS = ["joined_at", "role", "status"] as const
const BASE_PATH = "/members"

function roleBadgeVariant(role: string) {
  if (role === "Owner" || role === "Admin") return "default" as const
  if (role === "Manager") return "secondary" as const
  return "outline" as const
}

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/auth/login")

  const supabase = createSupabaseServiceClient()

  const { data: caller } = await supabase
    .from("org_members")
    .select("org_id, role, department_id")
    .eq("user_id", session.user.id)
    .eq("status", "Active")
    .maybeSingle()

  if (!caller) redirect("/onboarding")

  const callerRole = caller.role as string
  const callerDeptId = caller.department_id as string | null
  const isAdminOrOwner = callerRole === "Owner" || callerRole === "Admin"
  const isManager = callerRole === "Manager"

  // Managers and above can view this page
  if (!["Owner", "Admin", "Manager"].includes(callerRole)) redirect("/dashboard")

  const orgId = caller.org_id as string

  const sp = await searchParams
  const params = parseTableParams(sp, { defaultSort: "joined_at", defaultOrder: "asc" })
  const sortColumn = SORTABLE_COLUMNS.includes(params.sort as (typeof SORTABLE_COLUMNS)[number])
    ? params.sort
    : "joined_at"

  const roleFilter = typeof sp.role === "string" ? sp.role : ""
  const statusFilter = typeof sp.status === "string" ? sp.status : ""

  type RawMember = {
    id: string
    user_id: string
    role: string
    status: string
    joined_at: string
    department_id: string | null
    departments: { name: string } | null
  }
  type UserRecord = { id: string; name: string | null; email: string }

  const { data: rawDepts } = await supabase
    .from("departments")
    .select("id, name")
    .eq("org_id", orgId)
    .order("name")
  const departments = (rawDepts ?? []) as { id: string; name: string }[]

  let matchingUserIds: string[] | null = null
  if (params.q) {
    matchingUserIds = await lookupIdsByText(supabase, "user", ["name", "email"], "id", params.q)
  }

  let members: RawMember[] = []
  let totalCount = 0

  if (!params.q || (matchingUserIds && matchingUserIds.length > 0)) {
    let query = supabase
      .from("org_members")
      .select("id, user_id, role, status, joined_at, department_id, departments(name)", {
        count: "exact",
      })
      .eq("org_id", orgId)

    if (roleFilter) query = query.eq("role", roleFilter)
    if (statusFilter) query = query.eq("status", statusFilter)
    if (matchingUserIds) query = query.in("user_id", matchingUserIds)

    // Managers are scoped to their own department, but always see Owners/Admins
    // (org leadership isn't department-scoped, so it can't be filtered by dept).
    if (isManager) {
      query = callerDeptId
        ? query.or(`department_id.eq.${callerDeptId},role.in.(Owner,Admin)`)
        : query.in("role", ["Owner", "Admin"])
    }

    const { data, count } = await query
      .order(sortColumn, { ascending: params.order === "asc" })
      .range(...getRange(params.page, PAGE_SIZE))

    members = (data ?? []) as RawMember[]
    totalCount = count ?? 0
  }

  const userIds = members.map((m) => m.user_id)

  let rawUsers: UserRecord[] = []
  if (userIds.length > 0) {
    const { data } = await supabase.from("user").select("id, name, email").in("id", userIds)
    rawUsers = (data ?? []) as UserRecord[]
  }

  const userMap = new Map(rawUsers.map((u) => [u.id, u]))

  const rows = members.map((m) => {
    const user = userMap.get(m.user_id)
    return {
      id: m.id,
      userId: m.user_id,
      role: m.role as MemberRole,
      status: m.status as MemberStatus,
      joinedAt: m.joined_at,
      departmentId: m.department_id,
      departmentName: m.departments?.name ?? null,
      name: user?.name ?? null,
      email: user?.email ?? "",
    }
  })

  const hasActiveFilter = Boolean(params.q || roleFilter || statusFilter)

  return (
    <PageShell maxWidth="5xl">
      <PageHeader
        title="Members"
        meta={<span className="text-sm text-muted-foreground">{totalCount} total</span>}
      />

      <DataTable
        params={params}
        totalCount={totalCount}
        basePath={BASE_PATH}
        searchPlaceholder="Search members..."
        filters={
          <>
            <DataTableFilterSelect
              paramKey="role"
              pageParamKey="page"
              value={roleFilter}
              placeholder="All roles"
              options={["Owner", "Admin", "Manager", "Member", "Viewer"].map((r) => ({
                value: r,
                label: r,
              }))}
            />
            <DataTableFilterSelect
              paramKey="status"
              pageParamKey="page"
              value={statusFilter}
              placeholder="All statuses"
              options={["Active", "Suspended", "Pending"].map((s) => ({ value: s, label: s }))}
            />
          </>
        }
        isEmpty={rows.length === 0}
        emptyState={
          <p className="text-sm text-muted-foreground">
            {hasActiveFilter ? "No members match your search or filters." : "No members yet."}
          </p>
        }
      >
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">
                Member
              </th>
              <SortableHeader label="Role" sortKey="role" params={params} basePath={BASE_PATH} />
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">
                Department
              </th>
              <SortableHeader
                label="Status"
                sortKey="status"
                params={params}
                basePath={BASE_PATH}
              />
              <SortableHeader
                label="Joined"
                sortKey="joined_at"
                params={params}
                basePath={BASE_PATH}
              />
              {isAdminOrOwner && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((member) => {
              const isSelf = member.userId === session.user.id
              // Admins cannot see actions for Owner or other Admin members
              const canManage =
                isAdminOrOwner &&
                !isSelf &&
                !(callerRole === "Admin" && (member.role === "Owner" || member.role === "Admin"))

              return (
                <AnimatedTableRow key={member.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="size-7 rounded-full bg-muted flex items-center justify-center text-[11px] font-semibold shrink-0">
                        {(member.name ?? member.email)[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium leading-tight">
                          {member.name ?? <span className="text-muted-foreground">—</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">{member.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={roleBadgeVariant(member.role)}>{member.role}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {member.departmentName ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={member.status === "Suspended" ? "destructive" : "outline"}>
                      {member.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(member.joinedAt).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </td>
                  {isAdminOrOwner && (
                    <td className="px-4 py-3">
                      {canManage && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <MemberActions
                            memberId={member.id}
                            currentRole={member.role}
                            currentStatus={member.status}
                            currentDeptId={member.departmentId}
                            callerRole={callerRole}
                            departments={departments}
                          />
                          <RemoveMemberButton
                            memberId={member.id}
                            memberLabel={member.name ?? member.email}
                          />
                        </div>
                      )}
                    </td>
                  )}
                </AnimatedTableRow>
              )
            })}
          </tbody>
        </table>
      </DataTable>
    </PageShell>
  )
}
