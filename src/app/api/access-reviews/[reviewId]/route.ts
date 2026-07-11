import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { createSupabaseServiceClient } from "@/lib/supabase/server"
import { logAudit } from "@/lib/audit"

const schema = z.object({
  decision: z.enum(["Certified", "Revoked"]),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ reviewId: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { reviewId } = await params
  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 })

  const supabase = createSupabaseServiceClient()

  const { data: review } = await supabase
    .from("access_reviews")
    .select("id, org_id, reviewer_id, grant_id")
    .eq("id", reviewId)
    .maybeSingle()

  if (!review) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if ((review.reviewer_id as string) !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { error } = await supabase.rpc("decide_access_review", {
    p_review_id: reviewId,
    p_reviewer_id: session.user.id,
    p_decision: parsed.data.decision,
  })

  if (error) {
    return NextResponse.json(
      { error: "This review has already been decided." },
      { status: 409 }
    )
  }

  await logAudit({
    orgId: review.org_id as string,
    actorId: session.user.id,
    action: parsed.data.decision === "Certified" ? "ACCESS_REVIEW_CERTIFIED" : "ACCESS_REVIEW_REVOKED",
    targetType: "access_review",
    targetId: reviewId,
    metadata: { grantId: review.grant_id },
  })

  return NextResponse.json({ ok: true })
}
