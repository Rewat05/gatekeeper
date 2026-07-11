import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { createSupabaseServiceClient } from "@/lib/supabase/server"
import { logAudit } from "@/lib/audit"
import { resyncMemberProfile } from "@/lib/access-profiles"

const schema = z.object({
  role: z.enum(["Owner", "Admin", "Manager", "Member", "Viewer"]).optional(),
  status: z.enum(["Active", "Suspended"]).optional(),
  departmentId: z.string().uuid().nullable().optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { memberId } = await params
  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 })
  if (!parsed.data.role && !parsed.data.status && parsed.data.departmentId === undefined) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 })
  }

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

  const { data: target } = await supabase
    .from("org_members")
    .select("id, org_id, user_id, role, status, department_id")
    .eq("id", memberId)
    .maybeSingle()

  if (!target || (target.org_id as string) !== (caller.org_id as string)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if ((target.user_id as string) === session.user.id) {
    return NextResponse.json({ error: "You cannot modify your own membership." }, { status: 400 })
  }

  // Admins cannot modify Owners or other Admins, or promote to Owner/Admin
  if ((caller.role as string) === "Admin") {
    const targetRole = target.role as string
    if (
      targetRole === "Owner" ||
      targetRole === "Admin" ||
      parsed.data.role === "Owner" ||
      parsed.data.role === "Admin"
    ) {
      return NextResponse.json(
        { error: "Admins cannot modify Owners or Admins, or promote to those roles." },
        { status: 403 }
      )
    }
  }

  // Owners and Admins never belong to a department — their access spans the
  // whole org regardless, so any prior department assignment is cleared the
  // moment the role becomes (or already is) Owner/Admin.
  const finalRole = parsed.data.role ?? (target.role as string)
  const isAdminRole = finalRole === "Owner" || finalRole === "Admin"

  const update: Record<string, unknown> = {}
  if (parsed.data.role) update.role = parsed.data.role
  if (parsed.data.status) update.status = parsed.data.status
  if (isAdminRole) {
    if (target.department_id !== null) update.department_id = null
  } else if (parsed.data.departmentId !== undefined) {
    update.department_id = parsed.data.departmentId
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true })
  }

  const { error } = await supabase
    .from("org_members")
    .update(update)
    .eq("id", memberId)

  if (error) {
    // Reactivating someone who has since joined another org as Active would
    // violate the one-active-org-per-user constraint.
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "This person already belongs to another organisation." },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: "Update failed." }, { status: 500 })
  }

  const newDepartmentId = "department_id" in update
    ? (update.department_id as string | null)
    : (target.department_id as string | null)

  await resyncMemberProfile(supabase, {
    orgId: caller.org_id as string,
    userId: target.user_id as string,
    grantedBy: session.user.id,
    oldDepartmentId: target.department_id as string | null,
    oldRole: target.role as string,
    newDepartmentId,
    newRole: finalRole,
  })

  const changes: Record<string, unknown> = {}
  if (parsed.data.role) changes.role = { from: target.role, to: parsed.data.role }
  if (parsed.data.status) changes.status = { from: target.status, to: parsed.data.status }
  if ("department_id" in update) {
    changes.department = { from: target.department_id, to: update.department_id }
  }

  await logAudit({
    orgId: caller.org_id as string,
    actorId: session.user.id,
    action: "MEMBER_UPDATED",
    targetType: "org_member",
    targetId: memberId,
    metadata: { targetUserId: target.user_id, changes },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { memberId } = await params
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

  const { data: target } = await supabase
    .from("org_members")
    .select("id, org_id, user_id, role")
    .eq("id", memberId)
    .maybeSingle()

  if (!target || (target.org_id as string) !== (caller.org_id as string)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if ((target.user_id as string) === session.user.id) {
    return NextResponse.json({ error: "You cannot remove your own membership." }, { status: 400 })
  }

  const targetRole = target.role as string

  // Admins cannot remove Owners or other Admins — same boundary as PATCH.
  if ((caller.role as string) === "Admin" && (targetRole === "Owner" || targetRole === "Admin")) {
    return NextResponse.json({ error: "Admins cannot remove Owners or Admins." }, { status: 403 })
  }

  // Never leave the org without an Owner.
  if (targetRole === "Owner") {
    const { count } = await supabase
      .from("org_members")
      .select("id", { count: "exact", head: true })
      .eq("org_id", caller.org_id)
      .eq("role", "Owner")
      .eq("status", "Active")

    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: "Cannot remove the last Owner of the organisation." },
        { status: 400 }
      )
    }
  }

  // Cut off access immediately rather than leaving stale Active grants behind.
  await supabase
    .from("access_grants")
    .update({ status: "Revoked" })
    .eq("org_id", caller.org_id)
    .eq("user_id", target.user_id)
    .eq("status", "Active")

  const { error } = await supabase.from("org_members").delete().eq("id", memberId)
  if (error) return NextResponse.json({ error: "Failed to remove member." }, { status: 500 })

  await logAudit({
    orgId: caller.org_id as string,
    actorId: session.user.id,
    action: "MEMBER_REMOVED",
    targetType: "org_member",
    targetId: memberId,
    metadata: { targetUserId: target.user_id, role: targetRole },
  })

  return NextResponse.json({ ok: true })
}
