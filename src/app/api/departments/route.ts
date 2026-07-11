import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { createSupabaseServiceClient } from "@/lib/supabase/server"
import { logAudit } from "@/lib/audit"

const schema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  managerId: z.string().nullable().optional(),
})

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()
  const parsed = schema.safeParse(body)
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

  // Verify manager is an active org member (if provided)
  let manager: { id: string; department_id: string | null; role: string } | null = null
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
    manager = mgr as { id: string; department_id: string | null; role: string }
  }

  // Owners and Admins never belong to a department, even as manager
  const moveManager = Boolean(manager && manager.role !== "Owner" && manager.role !== "Admin")

  // Creating the department and moving the manager into it happen
  // atomically in one Postgres function call — if the update fails, the
  // department insert rolls back too, instead of leaving a department
  // whose audit trail claims a manager move that never actually happened.
  const { data: deptId, error } = await supabase.rpc("create_department_with_manager", {
    p_org_id: caller.org_id,
    p_name: parsed.data.name,
    p_description: parsed.data.description ?? null,
    p_manager_user_id: parsed.data.managerId ?? null,
    p_manager_member_id: moveManager ? (manager as NonNullable<typeof manager>).id : null,
  })

  if (error) return NextResponse.json({ error: "Failed to create department." }, { status: 500 })

  await logAudit({
    orgId: caller.org_id as string,
    actorId: session.user.id,
    action: "DEPARTMENT_CREATED",
    targetType: "department",
    targetId: deptId as string,
    metadata: { name: parsed.data.name },
  })

  if (moveManager) {
    const mgr = manager as NonNullable<typeof manager>
    await logAudit({
      orgId: caller.org_id as string,
      actorId: session.user.id,
      action: "MEMBER_UPDATED",
      targetType: "org_member",
      targetId: mgr.id,
      metadata: {
        targetUserId: parsed.data.managerId,
        changes: { department: { from: mgr.department_id, to: deptId } },
      },
    })
  }

  return NextResponse.json({ id: deptId }, { status: 201 })
}
