import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { createSupabaseServiceClient } from "@/lib/supabase/server"
import { logAudit } from "@/lib/audit"

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  managerId: z.string().nullable().optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const parsed = patchSchema.safeParse(body)
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

  const { data: dept } = await supabase
    .from("departments")
    .select("id, org_id, manager_id")
    .eq("id", id)
    .maybeSingle()

  if (!dept || (dept.org_id as string) !== (caller.org_id as string)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  let manager: { id: string; department_id: string | null; role: string } | null = null
  const managerChanged =
    parsed.data.managerId !== undefined && parsed.data.managerId !== dept.manager_id
  if (parsed.data.managerId) {
    const { data: mgr } = await supabase
      .from("org_members")
      .select("id, department_id, role")
      .eq("org_id", caller.org_id)
      .eq("user_id", parsed.data.managerId)
      .eq("status", "Active")
      .maybeSingle()

    if (!mgr) {
      return NextResponse.json({ error: "Manager must be an active org member." }, { status: 400 })
    }
    if (managerChanged) manager = mgr as { id: string; department_id: string | null; role: string }
  }

  const update: Record<string, unknown> = {}
  if (parsed.data.name !== undefined) update.name = parsed.data.name
  if (parsed.data.description !== undefined) update.description = parsed.data.description
  if (parsed.data.managerId !== undefined) update.manager_id = parsed.data.managerId

  const { error } = await supabase.from("departments").update(update).eq("id", id)
  if (error) return NextResponse.json({ error: "Update failed." }, { status: 500 })

  await logAudit({
    orgId: caller.org_id as string,
    actorId: session.user.id,
    action: "DEPARTMENT_UPDATED",
    targetType: "department",
    targetId: id,
    metadata: { changes: Object.keys(update) },
  })

  // Owners and Admins never belong to a department, even as manager
  if (manager && manager.role !== "Owner" && manager.role !== "Admin" && manager.department_id !== id) {
    await supabase.from("org_members").update({ department_id: id }).eq("id", manager.id)
    await logAudit({
      orgId: caller.org_id as string,
      actorId: session.user.id,
      action: "MEMBER_UPDATED",
      targetType: "org_member",
      targetId: manager.id,
      metadata: {
        targetUserId: parsed.data.managerId,
        changes: { department: { from: manager.department_id, to: id } },
      },
    })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
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

  const { data: dept } = await supabase
    .from("departments")
    .select("id, org_id")
    .eq("id", id)
    .maybeSingle()

  if (!dept || (dept.org_id as string) !== (caller.org_id as string)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const { error } = await supabase.from("departments").delete().eq("id", id)
  if (error) return NextResponse.json({ error: "Failed to delete department." }, { status: 500 })

  await logAudit({
    orgId: caller.org_id as string,
    actorId: session.user.id,
    action: "DEPARTMENT_DELETED",
    targetType: "department",
    targetId: id,
  })

  return NextResponse.json({ ok: true })
}
