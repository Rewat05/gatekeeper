import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { createSupabaseServiceClient } from "@/lib/supabase/server"
import { logAudit } from "@/lib/audit"

const schema = z.object({
  action: z.enum(["approve", "deny"]),
  note: z.string().optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { requestId } = await params
  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 })

  const supabase = createSupabaseServiceClient()

  const { data: joinRequest } = await supabase
    .from("join_requests")
    .select("id, org_id, requester_id, status")
    .eq("id", requestId)
    .maybeSingle()

  if (!joinRequest) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if ((joinRequest.status as string) !== "Pending") {
    return NextResponse.json({ error: "Request has already been reviewed." }, { status: 409 })
  }

  const { data: caller } = await supabase
    .from("org_members")
    .select("role")
    .eq("org_id", joinRequest.org_id)
    .eq("user_id", session.user.id)
    .eq("status", "Active")
    .maybeSingle()

  if (!caller || !["Owner", "Admin"].includes(caller.role as string)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (parsed.data.action === "approve") {
    const { data: existingMember } = await supabase
      .from("org_members")
      .select("id")
      .eq("org_id", joinRequest.org_id)
      .eq("user_id", joinRequest.requester_id)
      .maybeSingle()

    if (!existingMember) {
      // One email/user may only belong to one organisation at a time — check
      // before approving so a stale request against someone who has since
      // joined elsewhere fails clearly instead of silently double-enrolling.
      const { data: existingActive } = await supabase
        .from("org_members")
        .select("id")
        .eq("user_id", joinRequest.requester_id)
        .eq("status", "Active")
        .maybeSingle()

      if (existingActive) {
        return NextResponse.json(
          { error: "This person already belongs to another organisation." },
          { status: 409 }
        )
      }

      const { error: memberError } = await supabase
        .from("org_members")
        .insert({
          org_id: joinRequest.org_id,
          user_id: joinRequest.requester_id,
          role: "Member",
          status: "Active",
        })
      if (memberError) {
        if (memberError.code === "23505") {
          return NextResponse.json(
            { error: "This person already belongs to another organisation." },
            { status: 409 }
          )
        }
        return NextResponse.json({ error: "Failed to add member." }, { status: 500 })
      }
    }
  }

  const { error } = await supabase
    .from("join_requests")
    .update({
      status: parsed.data.action === "approve" ? "Approved" : "Denied",
      reviewed_by: session.user.id,
      reviewed_at: new Date().toISOString(),
      review_note: parsed.data.note ?? null,
    })
    .eq("id", requestId)

  if (error) return NextResponse.json({ error: "Failed to update request." }, { status: 500 })

  await logAudit({
    orgId: joinRequest.org_id as string,
    actorId: session.user.id,
    action: parsed.data.action === "approve" ? "JOIN_REQUEST_APPROVED" : "JOIN_REQUEST_DENIED",
    targetType: "join_request",
    targetId: requestId,
    metadata: { requesterId: joinRequest.requester_id, note: parsed.data.note ?? null },
  })

  return NextResponse.json({ ok: true })
}
