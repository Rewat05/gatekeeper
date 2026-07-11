import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { createSupabaseServiceClient } from "@/lib/supabase/server"
import { logAudit } from "@/lib/audit"

const schema = z.object({
  orgCode: z.string().min(1),
  reason: z.string().optional(),
})

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 })

  const { orgCode, reason } = parsed.data
  const supabase = createSupabaseServiceClient()

  // Resolve org by code
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("org_code", orgCode)
    .maybeSingle()

  if (!org) return NextResponse.json({ error: "Invalid organisation code." }, { status: 404 })

  // Guard: one email/user may only belong to one organisation at a time
  const { data: existingActive } = await supabase
    .from("org_members")
    .select("id, org_id")
    .eq("user_id", session.user.id)
    .eq("status", "Active")
    .maybeSingle()

  if (existingActive) {
    if (existingActive.org_id === org.id) {
      return NextResponse.json({ error: "Already a member." }, { status: 409 })
    }
    return NextResponse.json(
      { error: "You already belong to a different organisation." },
      { status: 409 }
    )
  }

  // Guard: pending request already exists
  const { data: pendingRequest } = await supabase
    .from("join_requests")
    .select("id")
    .eq("org_id", org.id)
    .eq("requester_id", session.user.id)
    .eq("status", "Pending")
    .maybeSingle()

  if (pendingRequest) {
    return NextResponse.json({ error: "You already have a pending request for this organisation." }, { status: 409 })
  }

  const { error } = await supabase
    .from("join_requests")
    .insert({
      org_id: org.id,
      requester_id: session.user.id,
      request_type: "Join",
      reason: reason ?? null,
    })

  if (error) return NextResponse.json({ error: "Failed to submit request." }, { status: 500 })

  await logAudit({
    orgId: org.id as string,
    actorId: session.user.id,
    action: "JOIN_REQUEST_SUBMITTED",
    targetType: "join_request",
    metadata: { reason: reason ?? null },
  })

  return NextResponse.json({ ok: true, orgName: org.name }, { status: 201 })
}
