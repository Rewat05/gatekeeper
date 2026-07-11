import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { createSupabaseServiceClient } from "@/lib/supabase/server"
import { logAudit } from "@/lib/audit"

const schema = z.object({
  orgId: z.string().uuid(),
})

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 })

  const { orgId } = parsed.data
  const supabase = createSupabaseServiceClient()

  // Verify the caller's email domain actually matches this org's trusted domain
  const emailDomain = session.user.email.split("@")[1]
  const { data: org } = await supabase
    .from("organizations")
    .select("id, domain")
    .eq("id", orgId)
    .maybeSingle()

  if (!org || org.domain !== emailDomain) {
    return NextResponse.json({ error: "Your email domain does not match this organisation." }, { status: 403 })
  }

  // Guard: one email/user may only belong to one organisation at a time
  const { data: existingActive } = await supabase
    .from("org_members")
    .select("id, org_id")
    .eq("user_id", session.user.id)
    .eq("status", "Active")
    .maybeSingle()

  if (existingActive) {
    if (existingActive.org_id === orgId) {
      return NextResponse.json({ error: "Already a member." }, { status: 409 })
    }
    return NextResponse.json(
      { error: "You already belong to a different organisation." },
      { status: 409 }
    )
  }

  const { error } = await supabase
    .from("org_members")
    .insert({ org_id: orgId, user_id: session.user.id, role: "Viewer", status: "Active" })

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "You already belong to a different organisation." },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: "Failed to join organisation." }, { status: 500 })
  }

  await logAudit({
    orgId: orgId,
    actorId: session.user.id,
    action: "MEMBER_JOINED",
    targetType: "org_member",
    metadata: { via: "domain_match" },
  })

  return NextResponse.json({ ok: true })
}
