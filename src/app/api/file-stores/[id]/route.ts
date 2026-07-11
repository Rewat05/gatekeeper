import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { createSupabaseServiceClient } from "@/lib/supabase/server"
import { logAudit } from "@/lib/audit"

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  classification: z.enum(["Public", "Internal", "Confidential", "Restricted"]).optional(),
  departmentIds: z.array(z.string().uuid()).optional(),
})

async function getCallerAndStore(
  userId: string,
  storeId: string,
  supabase: ReturnType<typeof createSupabaseServiceClient>
) {
  const [callerRes, storeRes, deptRes] = await Promise.all([
    supabase
      .from("org_members")
      .select("org_id, role, department_id")
      .eq("user_id", userId)
      .eq("status", "Active")
      .maybeSingle(),
    supabase
      .from("file_stores")
      .select("id, org_id, classification")
      .eq("id", storeId)
      .maybeSingle(),
    supabase.from("file_store_departments").select("department_id").eq("file_store_id", storeId),
  ])
  return {
    caller: callerRes.data as { org_id: string; role: string; department_id: string | null } | null,
    store: storeRes.data as { id: string; org_id: string; classification: string } | null,
    currentDeptIds: ((deptRes.data ?? []) as { department_id: string }[]).map((d) => d.department_id),
  }
}

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
  const { caller, store, currentDeptIds } = await getCallerAndStore(session.user.id, id, supabase)

  if (!caller || !["Owner", "Admin", "Manager"].includes(caller.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (!store || store.org_id !== caller.org_id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const departmentIds = parsed.data.departmentIds
    ? [...new Set(parsed.data.departmentIds)]
    : undefined

  if (caller.role === "Manager") {
    // Managers may only edit stores that are already exactly their own
    // single-department Internal store, and cannot widen scope beyond it.
    const isOwnScopedStore =
      store.classification === "Internal" &&
      currentDeptIds.length === 1 &&
      currentDeptIds[0] === caller.department_id
    if (!caller.department_id || !isOwnScopedStore) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    if (parsed.data.classification && parsed.data.classification !== "Internal") {
      return NextResponse.json({ error: "Managers cannot change classification." }, { status: 403 })
    }
    if (departmentIds && (departmentIds.length !== 1 || departmentIds[0] !== caller.department_id)) {
      return NextResponse.json(
        { error: "Managers can only tag their own department." },
        { status: 403 }
      )
    }
  } else if (departmentIds && departmentIds.length > 0) {
    const { data: validDepts } = await supabase
      .from("departments")
      .select("id")
      .eq("org_id", caller.org_id)
      .in("id", departmentIds)
    const validIds = new Set(((validDepts ?? []) as { id: string }[]).map((d) => d.id))
    if (departmentIds.some((deptId) => !validIds.has(deptId))) {
      return NextResponse.json({ error: "Invalid department." }, { status: 400 })
    }
  }

  const update: Record<string, unknown> = {}
  if (parsed.data.name !== undefined) update.name = parsed.data.name
  if (parsed.data.description !== undefined) update.description = parsed.data.description
  if (parsed.data.classification !== undefined) update.classification = parsed.data.classification

  if (Object.keys(update).length > 0) {
    const { error } = await supabase.from("file_stores").update(update).eq("id", id)
    if (error) return NextResponse.json({ error: "Update failed." }, { status: 500 })
  }

  if (departmentIds !== undefined) {
    await supabase.from("file_store_departments").delete().eq("file_store_id", id)
    if (departmentIds.length > 0) {
      const { error: deptError } = await supabase
        .from("file_store_departments")
        .insert(departmentIds.map((department_id) => ({ file_store_id: id, department_id })))
      if (deptError) return NextResponse.json({ error: "Update failed." }, { status: 500 })
    }
  }

  await logAudit({
    orgId: caller.org_id,
    actorId: session.user.id,
    action: "FILE_STORE_UPDATED",
    targetType: "file_store",
    targetId: id,
    metadata: { changes: Object.keys(update), departmentIds },
  })

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
  const { caller, store } = await getCallerAndStore(session.user.id, id, supabase)

  if (!caller || caller.role !== "Owner") {
    return NextResponse.json({ error: "Only Owners can delete file stores." }, { status: 403 })
  }
  if (!store || store.org_id !== caller.org_id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const { error } = await supabase.from("file_stores").delete().eq("id", id)
  if (error) return NextResponse.json({ error: "Delete failed." }, { status: 500 })

  await logAudit({
    orgId: caller.org_id,
    actorId: session.user.id,
    action: "FILE_STORE_DELETED",
    targetType: "file_store",
    targetId: id,
  })

  return NextResponse.json({ ok: true })
}
