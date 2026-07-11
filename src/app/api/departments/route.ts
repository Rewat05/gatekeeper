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

  const { data, error } = await supabase
    .from("departments")
    .insert({
      org_id: caller.org_id,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      manager_id: parsed.data.managerId ?? null,
    })
    .select("id")
    .single()

  if (error) return NextResponse.json({ error: "Failed to create department." }, { status: 500 })

  const deptId = (data as { id: string }).id
  await logAudit({
    orgId: caller.org_id as string,
    actorId: session.user.id,
    action: "DEPARTMENT_CREATED",
    targetType: "department",
    targetId: deptId,
    metadata: { name: parsed.data.name },
  })

  // Owners and Admins never belong to a department, even as manager
  if (manager && manager.role !== "Owner" && manager.role !== "Admin") {
    await supabase.from("org_members").update({ department_id: deptId }).eq("id", manager.id)
    await logAudit({
      orgId: caller.org_id as string,
      actorId: session.user.id,
      action: "MEMBER_UPDATED",
      targetType: "org_member",
      targetId: manager.id,
      metadata: {
        targetUserId: parsed.data.managerId,
        changes: { department: { from: manager.department_id, to: deptId } },
      },
    })
  }

  return NextResponse.json({ id: deptId }, { status: 201 })
}
