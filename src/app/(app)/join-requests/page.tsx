import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { createSupabaseServiceClient } from "@/lib/supabase/server"
import { JoinRequestActions } from "@/components/join-request-actions"
import { AutoRefresh } from "@/components/auto-refresh"
import { AnimatedTableRow } from "@/components/animated-table-row"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"
import { DataTable } from "@/components/data-table"
import { SortableHeader } from "@/components/sortable-header"
import { parseTableParams, getRange, lookupIdsByText, PAGE_SIZE } from "@/lib/table-params"

const SORTABLE_COLUMNS = ["created_at"] as const
const BASE_PATH = "/join-requests"

export default async function JoinRequestsPage({
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
  const params = parseTableParams(sp, { defaultSort: "created_at", defaultOrder: "asc" })
  const sortColumn = SORTABLE_COLUMNS.includes(params.sort as (typeof SORTABLE_COLUMNS)[number])
    ? params.sort
    : "created_at"

  type RawRequest = { id: string; requester_id: string; reason: string | null; created_at: string }
  type UserRecord = { id: string; name: string | null; email: string }

  let matchingUserIds: string[] | null = null
  if (params.q) {
    matchingUserIds = await lookupIdsByText(supabase, "user", ["name", "email"], "id", params.q)
  }

  let requests: RawRequest[] = []
  let totalCount = 0

  if (!params.q || (matchingUserIds && matchingUserIds.length > 0)) {
    let query = supabase
      .from("join_requests")
      .select("id, requester_id, reason, created_at", { count: "exact" })
      .eq("org_id", orgId)
      .eq("status", "Pending")
      .eq("request_type", "Join")

    if (matchingUserIds) query = query.in("requester_id", matchingUserIds)

    const { data, count } = await query
      .order(sortColumn, { ascending: params.order === "asc" })
      .range(...getRange(params.page, PAGE_SIZE))

    requests = (data ?? []) as RawRequest[]
    totalCount = count ?? 0
  }

  const requesterIds = requests.map((r) => r.requester_id)

  let rawUsers: UserRecord[] = []
  if (requesterIds.length > 0) {
    const { data } = await supabase.from("user").select("id, name, email").in("id", requesterIds)
    rawUsers = (data ?? []) as UserRecord[]
  }

  const userMap = new Map(rawUsers.map((u) => [u.id, u]))

  const rows = requests.map((r) => {
    const user = userMap.get(r.requester_id)
    return {
      id: r.id,
      reason: r.reason,
      createdAt: r.created_at,
      name: user?.name ?? null,
      email: user?.email ?? "",
    }
  })

  return (
    <PageShell maxWidth="4xl">
      <AutoRefresh />
      <PageHeader
        title="Join Requests"
        meta={
          totalCount > 0 && (
            <span className="text-sm text-muted-foreground">{totalCount} pending</span>
          )
        }
      />

      <DataTable
        params={params}
        totalCount={totalCount}
        basePath={BASE_PATH}
        searchPlaceholder="Search requesters..."
        isEmpty={rows.length === 0}
        emptyState={
          <div className="rounded-lg border border-dashed p-12 text-center">
            <p className="text-sm font-medium">
              {params.q ? "No requesters match your search." : "No pending requests"}
            </p>
            {!params.q && (
              <p className="text-xs text-muted-foreground mt-1">
                Share your organisation code so colleagues can request to join.
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
                Reason
              </th>
              <SortableHeader
                label="Submitted"
                sortKey="created_at"
                params={params}
                basePath={BASE_PATH}
              />
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((req) => (
              <AnimatedTableRow key={req.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="size-7 rounded-full bg-muted flex items-center justify-center text-[11px] font-semibold shrink-0">
                      {(req.name ?? req.email)[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium leading-tight">
                        {req.name ?? <span className="text-muted-foreground">—</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">{req.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground max-w-xs">
                  {req.reason ? (
                    <span className="line-clamp-2">{req.reason}</span>
                  ) : (
                    <span className="text-xs italic">No reason given</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(req.createdAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </td>
                <td className="px-4 py-3">
                  <JoinRequestActions requestId={req.id} />
                </td>
              </AnimatedTableRow>
            ))}
          </tbody>
        </table>
      </DataTable>
    </PageShell>
  )
}
