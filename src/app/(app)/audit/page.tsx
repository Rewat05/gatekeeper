import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { createSupabaseServiceClient } from "@/lib/supabase/server"
import { AnimatedTableRow } from "@/components/animated-table-row"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"
import { DataTable } from "@/components/data-table"
import { DataTableFilterSelect } from "@/components/data-table-filter-select"
import { SortableHeader } from "@/components/sortable-header"
import { parseTableParams, getRange, lookupIdsByText, PAGE_SIZE } from "@/lib/table-params"

type AuditRow = {
  id: string
  actor_id: string
  action: string
  target_type: string | null
  target_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}
type UserRecord = { id: string; name: string | null; email: string }

const ACTIONS = [
  "ORG_CREATED",
  "ORG_UPDATED",
  "DEPARTMENT_CREATED",
  "DEPARTMENT_UPDATED",
  "DEPARTMENT_DELETED",
  "FILE_STORE_CREATED",
  "FILE_STORE_UPDATED",
  "FILE_STORE_DELETED",
  "ACCESS_GRANT_CREATED",
  "ACCESS_GRANT_REVOKED",
  "ACCESS_REQUEST_SUBMITTED",
  "ACCESS_REQUEST_APPROVED",
  "ACCESS_REQUEST_DENIED",
  "JOIN_REQUEST_SUBMITTED",
  "JOIN_REQUEST_APPROVED",
  "JOIN_REQUEST_DENIED",
  "MEMBER_JOINED",
  "MEMBER_UPDATED",
] as const

const SORTABLE_COLUMNS = ["created_at", "action"] as const
const BASE_PATH = "/audit"

function fmt(date: string) {
  return new Date(date).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
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

  const sp = await searchParams
  const params = parseTableParams(sp, { defaultSort: "created_at", defaultOrder: "desc" })
  const sortColumn = SORTABLE_COLUMNS.includes(params.sort as (typeof SORTABLE_COLUMNS)[number])
    ? params.sort
    : "created_at"
  const actionFilter = typeof sp.action === "string" ? sp.action : ""

  let matchingActorIds: string[] | null = null
  if (params.q) {
    matchingActorIds = await lookupIdsByText(supabase, "user", ["name", "email"], "id", params.q)
  }

  let entries: AuditRow[] = []
  let totalCount = 0

  if (!params.q || (matchingActorIds && matchingActorIds.length > 0)) {
    let query = supabase
      .from("audit_log")
      .select("id, actor_id, action, target_type, target_id, metadata, created_at", {
        count: "exact",
      })
      .eq("org_id", orgId)

    if (actionFilter) query = query.eq("action", actionFilter)
    if (matchingActorIds) query = query.in("actor_id", matchingActorIds)

    const { data, count } = await query
      .order(sortColumn, { ascending: params.order === "asc" })
      .range(...getRange(params.page, PAGE_SIZE))

    entries = (data ?? []) as AuditRow[]
    totalCount = count ?? 0
  }

  const actorIds = [...new Set(entries.map((e) => e.actor_id))]
  let users: UserRecord[] = []
  if (actorIds.length > 0) {
    const { data } = await supabase.from("user").select("id, name, email").in("id", actorIds)
    users = (data ?? []) as UserRecord[]
  }
  const userMap = new Map(users.map((u) => [u.id, u]))
  const hasActiveFilter = Boolean(params.q || actionFilter)

  return (
    <PageShell maxWidth="6xl">
      <PageHeader title="Audit Log" />

      <DataTable
        params={params}
        totalCount={totalCount}
        basePath={BASE_PATH}
        searchPlaceholder="Search actors..."
        filters={
          <DataTableFilterSelect
            paramKey="action"
            pageParamKey="page"
            value={actionFilter}
            placeholder="All actions"
            options={ACTIONS.map((a) => ({ value: a, label: a }))}
          />
        }
        isEmpty={entries.length === 0}
        emptyState={
          <div className="rounded-lg border border-dashed p-12 text-center">
            <p className="text-sm font-medium">
              {hasActiveFilter ? "No entries match your search or filters." : "No audit entries yet"}
            </p>
            {!hasActiveFilter && (
              <p className="text-xs text-muted-foreground mt-1">
                Actions taken by org members will appear here.
              </p>
            )}
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <SortableHeader
                  label="Time"
                  sortKey="created_at"
                  params={params}
                  basePath={BASE_PATH}
                  className="whitespace-nowrap"
                />
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">
                  Actor
                </th>
                <SortableHeader label="Action" sortKey="action" params={params} basePath={BASE_PATH} />
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">
                  Target
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {entries.map((entry) => {
                const actor = userMap.get(entry.actor_id)
                return (
                  <AnimatedTableRow key={entry.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {fmt(entry.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-medium leading-tight">{actor?.name ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{actor?.email ?? entry.actor_id}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                        {entry.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {entry.target_type && <span>{entry.target_type}</span>}
                      {entry.target_id && (
                        <span className="ml-1 font-mono opacity-60">
                          {entry.target_id.length > 8
                            ? `${entry.target_id.slice(0, 8)}…`
                            : entry.target_id}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs">
                      {entry.metadata && (
                        <span className="font-mono opacity-70 line-clamp-2 break-all">
                          {JSON.stringify(entry.metadata)}
                        </span>
                      )}
                    </td>
                  </AnimatedTableRow>
                )
              })}
            </tbody>
          </table>
        </div>
      </DataTable>
    </PageShell>
  )
}
