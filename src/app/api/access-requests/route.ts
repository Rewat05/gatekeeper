import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { createSupabaseServiceClient } from "@/lib/supabase/server"
import { logAudit } from "@/lib/audit"
import { expireStaleGrants } from "@/lib/grants"

const schema = z.object({
  fileStoreId: z.string().uuid(),
  permissionRequested: z.enum(["Read", "Write"]),
  justification: z.string().optional(),
})

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 })

  const { fileStoreId, permissionRequested, justification } = parsed.data
  const supabase = createSupabaseServiceClient()

  const { data: caller } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", session.user.id)
    .eq("status", "Active")
    .maybeSingle()

  if (!caller) return NextResponse.json({ error: "Not an org member." }, { status: 403 })

  const { data: store } = await supabase
    .from("file_stores")
    .select("id, org_id")
    .eq("id", fileStoreId)
    .maybeSingle()

  if (!store || (store.org_id as string) !== (caller.org_id as string)) {
    return NextResponse.json({ error: "File store not found." }, { status: 404 })
  }

  // Guard: already has an active grant
  await expireStaleGrants(supabase, { fileStoreId, userId: session.user.id })
  const { data: existingGrant } = await supabase
    .from("access_grants")
    .select("id")
    .eq("file_store_id", fileStoreId)
    .eq("user_id", session.user.id)
    .eq("status", "Active")
    .maybeSingle()

  if (existingGrant) {
    return NextResponse.json({ error: "You already have access to this file store." }, { status: 409 })
  }

  // Guard: pending request already exists
  const { data: pendingReq } = await supabase
    .from("access_requests")
    .select("id")
    .eq("file_store_id", fileStoreId)
    .eq("requester_id", session.user.id)
    .eq("status", "Pending")
    .maybeSingle()

  if (pendingReq) {
    return NextResponse.json({ error: "You already have a pending request for this file store." }, { status: 409 })
  }

  const { error } = await supabase.from("access_requests").insert({
    org_id: caller.org_id,
    requester_id: session.user.id,
    file_store_id: fileStoreId,
    permission_requested: permissionRequested,
    justification: justification ?? null,
  })

  if (error) return NextResponse.json({ error: "Failed to submit request." }, { status: 500 })

  await logAudit({
    orgId: caller.org_id as string,
    actorId: session.user.id,
    action: "ACCESS_REQUEST_SUBMITTED",
    targetType: "access_request",
    targetId: fileStoreId,
    metadata: { permission: permissionRequested, justification: justification ?? null },
  })

  return NextResponse.json({ ok: true }, { status: 201 })
}
