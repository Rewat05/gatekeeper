import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { createSupabaseServiceClient } from "@/lib/supabase/server"
import { logAudit } from "@/lib/audit"

const schema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  classification: z.enum(["Public", "Internal", "Confidential", "Restricted"]),
  departmentIds: z.array(z.string().uuid()).optional(),
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
    .select("org_id, role, department_id")
    .eq("user_id", session.user.id)
    .eq("status", "Active")
    .maybeSingle()

  if (!caller || !["Owner", "Admin", "Manager"].includes(caller.role as string)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const callerRole = caller.role as string
  let classification = parsed.data.classification
  let departmentIds = [...new Set(parsed.data.departmentIds ?? [])]

  if (callerRole === "Manager") {
    // Managers can only stand up department-scoped stores for their own department.
    if (!caller.department_id) {
      return NextResponse.json(
        { error: "You must belong to a department to create a file store." },
        { status: 403 }
      )
    }
    classification = "Internal"
    departmentIds = [caller.department_id as string]
  } else if (departmentIds.length > 0) {
    const { data: validDepts } = await supabase
      .from("departments")
      .select("id")
      .eq("org_id", caller.org_id)
      .in("id", departmentIds)
    const validIds = new Set(((validDepts ?? []) as { id: string }[]).map((d) => d.id))
    if (departmentIds.some((id) => !validIds.has(id))) {
      return NextResponse.json({ error: "Invalid department." }, { status: 400 })
    }
  }

  const { data, error } = await supabase
    .from("file_stores")
    .insert({
      org_id: caller.org_id,
      owner_id: session.user.id,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      classification,
    })
    .select("id")
    .single()

  if (error) return NextResponse.json({ error: "Failed to create file store." }, { status: 500 })

  const storeId = (data as { id: string }).id

  if (departmentIds.length > 0) {
    const { error: deptError } = await supabase
      .from("file_store_departments")
      .insert(departmentIds.map((department_id) => ({ file_store_id: storeId, department_id })))
    if (deptError) {
      return NextResponse.json({ error: "Failed to tag departments." }, { status: 500 })
    }
  }

  await logAudit({
    orgId: caller.org_id as string,
    actorId: session.user.id,
    action: "FILE_STORE_CREATED",
    targetType: "file_store",
    targetId: storeId,
    metadata: { name: parsed.data.name, classification, departmentIds },
  })

  return NextResponse.json({ id: storeId }, { status: 201 })
}
