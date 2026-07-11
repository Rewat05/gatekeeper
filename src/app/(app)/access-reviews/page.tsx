import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { createSupabaseServiceClient } from "@/lib/supabase/server"
import { closeExpiredCampaigns } from "@/lib/review-campaigns"
import { Badge } from "@/components/ui/badge"
import { AnimatedTableRow } from "@/components/animated-table-row"
import { AccessReviewActions } from "@/components/access-review-actions"
import { StartCampaignButton } from "@/components/start-campaign-button"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"

type UserRecord = { id: string; name: string | null; email: string }
type RawReview = {
  id: string
  access_grants: {
    id: string
    user_id: string
    permission: string
    granted_by: string
    file_stores: { name: string } | null
  } | null
  review_campaigns: { closes_at: string } | null
}

function fmt(date: string) {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export default async function AccessReviewsPage() {
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

  const orgId = caller.org_id as string
  const isAdmin = caller.role === "Owner" || caller.role === "Admin"

  await closeExpiredCampaigns(supabase, orgId)

  const { data: rawReviews } = await supabase
    .from("access_reviews")
    .select(
      "id, access_grants(id, user_id, permission, granted_by, file_stores(name)), review_campaigns!inner(closes_at, status)"
    )
    .eq("reviewer_id", session.user.id)
    .eq("org_id", orgId)
    .is("decision", null)
    .eq("review_campaigns.status", "Active")
    .order("created_at", { ascending: true })

  const reviews = (rawReviews ?? []) as unknown as RawReview[]

  const userIds = [
    ...new Set(
      reviews.flatMap((r) => [r.access_grants?.user_id, r.access_grants?.granted_by].filter(Boolean) as string[])
    ),
  ]

  let users: UserRecord[] = []
  if (userIds.length > 0) {
    const { data } = await supabase.from("user").select("id, name, email").in("id", userIds)
    users = (data ?? []) as UserRecord[]
  }
  const userMap = new Map(users.map((u) => [u.id, u]))

  return (
    <PageShell maxWidth="5xl">
      <PageHeader
        title="Access Reviews"
        description="Periodically re-confirm that existing access is still needed."
        meta={<span className="text-sm text-muted-foreground">{reviews.length} pending</span>}
        actions={isAdmin && <StartCampaignButton />}
      />

      {reviews.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-sm font-medium">No pending reviews</p>
          <p className="text-xs text-muted-foreground mt-1">
            {isAdmin
              ? "Start a review campaign to begin recertifying access across your organisation."
              : "You're all caught up."}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">
                  Grantee
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">
                  File store
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">
                  Permission
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">
                  Granted by
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">
                  Review due
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {reviews.map((review) => {
                const grant = review.access_grants
                const grantee = grant ? userMap.get(grant.user_id) : undefined
                const grantor = grant ? userMap.get(grant.granted_by) : undefined
                return (
                  <AnimatedTableRow key={review.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium">{grantee?.name ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{grantee?.email ?? ""}</p>
                    </td>
                    <td className="px-4 py-3 font-medium">{grant?.file_stores?.name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Badge variant={grant?.permission === "Write" ? "default" : "outline"}>
                        {grant?.permission}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {grantor?.name ?? grantor?.email ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {review.review_campaigns?.closes_at ? fmt(review.review_campaigns.closes_at) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <AccessReviewActions reviewId={review.id} />
                    </td>
                  </AnimatedTableRow>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  )
}
