import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { createSupabaseServiceClient } from "@/lib/supabase/server"
import { logAudit } from "@/lib/audit"

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; grantId: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: storeId, grantId } = await params
  const supabase = createSupabaseServiceClient()

  const { data: grant } = await supabase
    .from("access_grants")
    .select("id, org_id")
    .eq("id", grantId)
    .eq("file_store_id", storeId)
    .maybeSingle()

  if (!grant) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { data: caller } = await supabase
    .from("org_members")
    .select("role, department_id")
    .eq("org_id", grant.org_id)
    .eq("user_id", session.user.id)
    .eq("status", "Active")
    .maybeSingle()

  if (!caller || !["Owner", "Admin", "Manager"].includes(caller.role as string)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Managers can only revoke grants on file stores tagged with their own department.
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

  const { error } = await supabase
    .from("access_grants")
    .update({ status: "Revoked" })
    .eq("id", grantId)

  if (error) return NextResponse.json({ error: "Failed to revoke grant." }, { status: 500 })

  await logAudit({
    orgId: grant.org_id as string,
    actorId: session.user.id,
    action: "ACCESS_GRANT_REVOKED",
    targetType: "access_grant",
    targetId: grantId,
  })

  return NextResponse.json({ ok: true })
}
