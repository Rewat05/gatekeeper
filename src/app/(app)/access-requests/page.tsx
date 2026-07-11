import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { createSupabaseServiceClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { AccessRequestActions } from "@/components/access-request-actions"
import { AutoRefresh } from "@/components/auto-refresh"
import { AnimatedTableRow } from "@/components/animated-table-row"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"
import { DataTable } from "@/components/data-table"
import { DataTableFilterSelect } from "@/components/data-table-filter-select"
import { SortableHeader } from "@/components/sortable-header"
import { parseTableParams, getRange, lookupIdsByText, PAGE_SIZE } from "@/lib/table-params"

type UserRecord = { id: string; name: string | null; email: string }
type RawRequest = {
  id: string
  requester_id: string
  file_store_id: string
  permission_requested: string
  justification: string | null
  status: string
  review_note: string | null
  created_at: string
  reviewed_at: string | null
  file_stores: { name: string } | null
}

const PENDING_SORTABLE = ["created_at"] as const
const MINE_SORTABLE = ["created_at", "status"] as const
const BASE_PATH = "/access-requests"

function statusVariant(s: string) {
  if (s === "Approved") return "default" as const
  if (s === "Denied") return "destructive" as const
  return "secondary" as const
}

function fmt(date: string) {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export default async function AccessRequestsPage({
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

  const orgId = caller.org_id as string
  const callerRole = caller.role as string
  const callerDeptId = caller.department_id as string | null
  const isReviewer = ["Owner", "Admin", "Manager"].includes(callerRole)
  // Managers are scoped to reviewing requests for file stores in their own department.
  const canReviewAnything = isReviewer && (callerRole !== "Manager" || Boolean(callerDeptId))

  const sp = await searchParams

  const pendingParams = parseTableParams(sp, {
    prefix: "pending_",
    defaultSort: "created_at",
    defaultOrder: "asc",
  })
  const pendingSort = PENDING_SORTABLE.includes(
    pendingParams.sort as (typeof PENDING_SORTABLE)[number]
  )
    ? pendingParams.sort
    : "created_at"
  const permissionFilter = typeof sp.pending_permission === "string" ? sp.pending_permission : ""

  const mineParams = parseTableParams(sp, {
    prefix: "mine_",
    defaultSort: "created_at",
    defaultOrder: "desc",
  })
  const mineSort = MINE_SORTABLE.includes(mineParams.sort as (typeof MINE_SORTABLE)[number])
    ? mineParams.sort
    : "created_at"
  const mineStatusFilter = typeof sp.mine_status === "string" ? sp.mine_status : ""

  // Pending requests to review (for Owner/Admin/Manager)
  let pendingRows: RawRequest[] = []
  let pendingTotal = 0
  let requesterUsers: UserRecord[] = []

  if (canReviewAnything) {
    let matchingUserIds: string[] | null = null
    if (pendingParams.q) {
      matchingUserIds = await lookupIdsByText(
        supabase,
        "user",
        ["name", "email"],
        "id",
        pendingParams.q
      )
    }

    // Managers only review requests for file stores tagged with their own department.
    let managerStoreIds: string[] | null = null
    if (callerRole === "Manager") {
      const { data: tags } = await supabase
        .from("file_store_departments")
        .select("file_store_id")
        .eq("department_id", callerDeptId ?? "")
      managerStoreIds = ((tags ?? []) as { file_store_id: string }[]).map((t) => t.file_store_id)
    }

    if (
      (!pendingParams.q || (matchingUserIds && matchingUserIds.length > 0)) &&
      (!managerStoreIds || managerStoreIds.length > 0)
    ) {
      let query = supabase
        .from("access_requests")
        .select(
          "id, requester_id, file_store_id, permission_requested, justification, status, review_note, created_at, reviewed_at, file_stores(name)",
          { count: "exact" }
        )
        .eq("org_id", orgId)
        .eq("status", "Pending")

      if (managerStoreIds) query = query.in("file_store_id", managerStoreIds)
      if (permissionFilter) query = query.eq("permission_requested", permissionFilter)
      if (matchingUserIds) query = query.in("requester_id", matchingUserIds)

      const { data, count } = await query
        .order(pendingSort, { ascending: pendingParams.order === "asc" })
        .range(...getRange(pendingParams.page, PAGE_SIZE))

      pendingRows = (data ?? []) as RawRequest[]
      pendingTotal = count ?? 0
    }

    const requesterIds = [...new Set(pendingRows.map((r) => r.requester_id))]
    if (requesterIds.length > 0) {
      const { data: users } = await supabase
        .from("user")
        .select("id, name, email")
        .in("id", requesterIds)
      requesterUsers = (users ?? []) as UserRecord[]
    }
  }

  // My submitted requests
  let mineQuery = supabase
    .from("access_requests")
    .select(
      "id, requester_id, file_store_id, permission_requested, justification, status, review_note, created_at, reviewed_at, file_stores(name)",
      { count: "exact" }
    )
    .eq("requester_id", session.user.id)
    .eq("org_id", orgId)

  if (mineStatusFilter) mineQuery = mineQuery.eq("status", mineStatusFilter)

  const { data: myRaw, count: mineCount } = await mineQuery
    .order(mineSort, { ascending: mineParams.order === "asc" })
    .range(...getRange(mineParams.page, PAGE_SIZE))

  const myRows = (myRaw ?? []) as RawRequest[]
  const mineTotal = mineCount ?? 0

  const requesterMap = new Map(requesterUsers.map((u) => [u.id, u]))
  const pendingHasFilter = Boolean(pendingParams.q || permissionFilter)

  return (
    <PageShell maxWidth="5xl" spacing="space-y-10">
      <AutoRefresh />
      <PageHeader title="Access Requests" />

      {/* Pending Reviews — shown to Owner/Admin/Manager */}
      {isReviewer && (
        <section className="space-y-4">
          <div className="flex items-baseline gap-3">
            <h2 className="text-base font-semibold">Pending Reviews</h2>
            {pendingTotal > 0 && (
              <span className="text-sm text-muted-foreground">{pendingTotal} pending</span>
            )}
          </div>

          <DataTable
            params={pendingParams}
            paramPrefix="pending_"
            totalCount={pendingTotal}
            basePath={BASE_PATH}
            searchPlaceholder="Search requesters..."
            filters={
              <DataTableFilterSelect
                paramKey="pending_permission"
                pageParamKey="pending_page"
                value={permissionFilter}
                placeholder="All permissions"
                options={[
                  { value: "Read", label: "Read" },
                  { value: "Write", label: "Write" },
                ]}
              />
            }
            isEmpty={pendingRows.length === 0}
            emptyState={
              <div className="rounded-lg border border-dashed p-10 text-center">
                <p className="text-sm font-medium">
                  {pendingHasFilter ? "No requests match your search or filters." : "No pending requests"}
                </p>
                {!pendingHasFilter && (
                  <p className="text-xs text-muted-foreground mt-1">
                    All access requests have been reviewed.
                  </p>
                )}
              </div>
            }
          >
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">
                    Requester
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">
                    File store
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">
                    Permission
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">
                    Justification
                  </th>
                  <SortableHeader
                    label="Submitted"
                    sortKey="created_at"
                    params={pendingParams}
                    paramPrefix="pending_"
                    basePath={BASE_PATH}
                  />
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {pendingRows.map((req) => {
                  const user = requesterMap.get(req.requester_id)
                  const store = req.file_stores as { name: string } | null
                  return (
                    <AnimatedTableRow key={req.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium">{user?.name ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{user?.email ?? ""}</p>
                      </td>
                      <td className="px-4 py-3 font-medium">{store?.name ?? "—"}</td>
                      <td className="px-4 py-3">
                        <Badge variant={req.permission_requested === "Write" ? "default" : "outline"}>
                          {req.permission_requested}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground max-w-xs">
                        {req.justification ? (
                          <span className="line-clamp-2 text-xs">{req.justification}</span>
                        ) : (
                          <span className="text-xs italic">None given</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {fmt(req.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <AccessRequestActions requestId={req.id} />
                      </td>
                    </AnimatedTableRow>
                  )
                })}
              </tbody>
            </table>
          </DataTable>
        </section>
      )}

      {isReviewer && <Separator />}

      {/* My Requests — shown to everyone */}
      <section className="space-y-4">
        <div className="flex items-baseline gap-3">
          <h2 className="text-base font-semibold">My Requests</h2>
          {mineTotal > 0 && (
            <span className="text-sm text-muted-foreground">{mineTotal} total</span>
          )}
        </div>

        <DataTable
          params={mineParams}
          paramPrefix="mine_"
          totalCount={mineTotal}
          basePath={BASE_PATH}
          filters={
            <DataTableFilterSelect
              paramKey="mine_status"
              pageParamKey="mine_page"
              value={mineStatusFilter}
              placeholder="All statuses"
              options={[
                { value: "Pending", label: "Pending" },
                { value: "Approved", label: "Approved" },
                { value: "Denied", label: "Denied" },
              ]}
            />
          }
          isEmpty={myRows.length === 0}
          emptyState={
            <div className="rounded-lg border border-dashed p-10 text-center">
              <p className="text-sm font-medium">
                {mineStatusFilter ? "No requests match this filter." : "No requests submitted"}
              </p>
              {!mineStatusFilter && (
                <p className="text-xs text-muted-foreground mt-1">
                  Request access to a file store from its detail page.
                </p>
              )}
            </div>
          }
        >
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">
                  File store
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">
                  Permission
                </th>
                <SortableHeader
                  label="Status"
                  sortKey="status"
                  params={mineParams}
                  paramPrefix="mine_"
                  basePath={BASE_PATH}
                />
                <SortableHeader
                  label="Submitted"
                  sortKey="created_at"
                  params={mineParams}
                  paramPrefix="mine_"
                  basePath={BASE_PATH}
                />
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">
                  Review note
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {myRows.map((req) => {
                const store = req.file_stores as { name: string } | null
                return (
                  <AnimatedTableRow key={req.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">{store?.name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Badge variant={req.permission_requested === "Write" ? "default" : "outline"}>
                        {req.permission_requested}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusVariant(req.status)}>{req.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {fmt(req.created_at)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs">
                      {req.review_note ? (
                        <span className="line-clamp-2">{req.review_note}</span>
                      ) : (
                        <span className="italic">—</span>
                      )}
                    </td>
                  </AnimatedTableRow>
                )
              })}
            </tbody>
          </table>
        </DataTable>
      </section>
    </PageShell>
  )
}
