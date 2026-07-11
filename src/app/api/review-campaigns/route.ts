import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { createSupabaseServiceClient } from "@/lib/supabase/server"
import { logAudit } from "@/lib/audit"
import { closeExpiredCampaigns } from "@/lib/review-campaigns"

const schema = z.object({
  daysOpen: z.number().int().min(1).max(180).optional(),
})

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 })

  const supabase = createSupabaseServiceClient()

  const { data: caller } = await supabase
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", session.user.id)
    .eq("status", "Active")
    .maybeSingle()

  if (!caller || !["Owner", "Admin"].includes(caller.role as string)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Close out any campaign whose due date already passed before checking
  // the one-active-campaign-per-org rule, so a stale campaign nobody
  // closed doesn't permanently block starting a new one.
  await closeExpiredCampaigns(supabase, caller.org_id as string)

  const { data: campaignId, error } = await supabase.rpc("start_review_campaign", {
    p_org_id: caller.org_id,
    p_triggered_by: session.user.id,
    p_days_open: parsed.data.daysOpen ?? 30,
  })

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "A review campaign is already in progress for your organisation." },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: "Failed to start review campaign." }, { status: 500 })
  }

  await logAudit({
    orgId: caller.org_id as string,
    actorId: session.user.id,
    action: "REVIEW_CAMPAIGN_STARTED",
    targetType: "review_campaign",
    targetId: campaignId as string,
  })

  return NextResponse.json({ id: campaignId }, { status: 201 })
}
