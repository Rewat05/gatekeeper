import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { createSupabaseServiceClient } from "@/lib/supabase/server"
import { logAudit } from "@/lib/audit"
import { defaultGrantExpiry } from "@/lib/grants"

const schema = z.object({
  email: z.string().email(),
  permission: z.enum(["Read", "Write"]),
  expiresAt: z.string().datetime().nullable().optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: storeId } = await params
  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 })

  const supabase = createSupabaseServiceClient()

  const { data: store } = await supabase
    .from("file_stores")
    .select("id, org_id")
    .eq("id", storeId)
    .maybeSingle()

  if (!store) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { data: caller } = await supabase
    .from("org_members")
    .select("role, department_id")
    .eq("org_id", store.org_id)
    .eq("user_id", session.user.id)
    .eq("status", "Active")
    .maybeSingle()

  if (!caller || !["Owner", "Admin", "Manager"].includes(caller.role as string)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Managers can only grant access on file stores tagged with their own department.
  if ((caller.role as string) === "Manager") {
    if (!caller.department_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const { data: tag } = await supabase
      .from("file_store_departments")
      .select("department_id")
      .eq("file_store_id", storeId)
      .eq("department_id", caller.department_id)
      .maybeSingle()
    if (!tag) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Resolve email → user id
  const { data: targetUser } = await supabase
    .from("user")
    .select("id")
    .eq("email", parsed.data.email)
    .maybeSingle()

  if (!targetUser) {
    return NextResponse.json({ error: "No user found with that email." }, { status: 404 })
  }

  // Target must be an active org member
  const { data: targetMember } = await supabase
    .from("org_members")
    .select("id")
    .eq("org_id", store.org_id)
    .eq("user_id", targetUser.id)
    .eq("status", "Active")
    .maybeSingle()

  if (!targetMember) {
    return NextResponse.json(
      { error: "That user is not an active member of this organisation." },
      { status: 400 }
    )
  }

  // Every grant expires — defaults to 7 days out if the granter doesn't pick a date.
  const expiresAt = parsed.data.expiresAt ?? defaultGrantExpiry()

  // Upsert — handles re-granting a previously revoked grant
  const { error } = await supabase.from("access_grants").upsert(
    {
      org_id: store.org_id,
      user_id: targetUser.id as string,
      file_store_id: storeId,
      permission: parsed.data.permission,
      granted_by: session.user.id,
      expires_at: expiresAt,
      status: "Active",
      source_profile_id: null,
    },
    { onConflict: "org_id,user_id,file_store_id" }
  )

  if (error) return NextResponse.json({ error: "Failed to grant access." }, { status: 500 })

  await logAudit({
    orgId: store.org_id as string,
    actorId: session.user.id,
    action: "ACCESS_GRANT_CREATED",
    targetType: "access_grant",
    targetId: storeId,
    metadata: {
      grantedTo: targetUser.id as string,
      permission: parsed.data.permission,
      expiresAt,
    },
  })

  return NextResponse.json({ ok: true }, { status: 201 })
}
