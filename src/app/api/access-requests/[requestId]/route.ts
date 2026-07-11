import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { createSupabaseServiceClient } from "@/lib/supabase/server"
import { logAudit } from "@/lib/audit"
import { defaultGrantExpiry } from "@/lib/grants"

const schema = z.object({
  action: z.enum(["approve", "deny"]),
  note: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
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

  const { data: accessRequest } = await supabase
    .from("access_requests")
    .select("id, org_id, requester_id, file_store_id, permission_requested, status")
    .eq("id", requestId)
    .maybeSingle()

  if (!accessRequest) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if ((accessRequest.status as string) !== "Pending") {
    return NextResponse.json({ error: "Request has already been reviewed." }, { status: 409 })
  }

  const { data: caller } = await supabase
    .from("org_members")
    .select("role, department_id")
    .eq("org_id", accessRequest.org_id)
    .eq("user_id", session.user.id)
    .eq("status", "Active")
    .maybeSingle()

  if (!caller || !["Owner", "Admin", "Manager"].includes(caller.role as string)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Managers are scoped to reviewing requests for file stores tagged with their own department.
  if ((caller.role as string) === "Manager") {
    if (!caller.department_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const { data: tag } = await supabase
      .from("file_store_departments")
      .select("department_id")
      .eq("file_store_id", accessRequest.file_store_id)
      .eq("department_id", caller.department_id)
      .maybeSingle()
    if (!tag) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (parsed.data.action === "approve") {
    // Every grant expires — defaults to 7 days out if the reviewer doesn't pick a date.
    const expiresAt = parsed.data.expiresAt ?? defaultGrantExpiry()
    const { error: grantError } = await supabase.from("access_grants").upsert(
      {
        org_id: accessRequest.org_id,
        user_id: accessRequest.requester_id,
        file_store_id: accessRequest.file_store_id,
        permission: accessRequest.permission_requested,
        granted_by: session.user.id,
        expires_at: expiresAt,
        status: "Active",
        source_profile_id: null,
      },
      { onConflict: "org_id,user_id,file_store_id" }
    )
    if (grantError) return NextResponse.json({ error: "Failed to create grant." }, { status: 500 })
  }

  const { error } = await supabase
    .from("access_requests")
    .update({
      status: parsed.data.action === "approve" ? "Approved" : "Denied",
      reviewed_by: session.user.id,
      reviewed_at: new Date().toISOString(),
      review_note: parsed.data.note ?? null,
    })
    .eq("id", requestId)

  if (error) return NextResponse.json({ error: "Failed to update request." }, { status: 500 })

  await logAudit({
    orgId: accessRequest.org_id as string,
    actorId: session.user.id,
    action: parsed.data.action === "approve" ? "ACCESS_REQUEST_APPROVED" : "ACCESS_REQUEST_DENIED",
    targetType: "access_request",
    targetId: requestId,
    metadata: {
      requesterId: accessRequest.requester_id,
      fileStoreId: accessRequest.file_store_id,
      note: parsed.data.note ?? null,
    },
  })

  return NextResponse.json({ ok: true })
}
