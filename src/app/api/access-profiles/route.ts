import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { createSupabaseServiceClient } from "@/lib/supabase/server"
import { logAudit } from "@/lib/audit"
import { resyncAllMembersForProfile } from "@/lib/access-profiles"

const schema = z.object({
  departmentId: z.string().uuid(),
  role: z.enum(["Manager", "Member", "Viewer"]),
  storeGrants: z
    .array(
      z.object({
        fileStoreId: z.string().uuid(),
        permission: z.enum(["Read", "Write"]),
      })
    )
    .default([]),
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

  const orgId = caller.org_id as string

  const { data: dept } = await supabase
    .from("departments")
    .select("id")
    .eq("id", parsed.data.departmentId)
    .eq("org_id", orgId)
    .maybeSingle()
  if (!dept) return NextResponse.json({ error: "Invalid department." }, { status: 400 })

  // Dedupe by store, last one wins
  const storeGrants = [...new Map(parsed.data.storeGrants.map((g) => [g.fileStoreId, g])).values()]

  if (storeGrants.length > 0) {
    const { data: validStores } = await supabase
      .from("file_stores")
      .select("id")
      .eq("org_id", orgId)
      .in(
        "id",
        storeGrants.map((g) => g.fileStoreId)
      )
    const validIds = new Set(((validStores ?? []) as { id: string }[]).map((s) => s.id))
    if (storeGrants.some((g) => !validIds.has(g.fileStoreId))) {
      return NextResponse.json({ error: "Invalid file store." }, { status: 400 })
    }
  }

  const { data: profile, error } = await supabase
    .from("access_profiles")
    .insert({
      org_id: orgId,
      department_id: parsed.data.departmentId,
      role: parsed.data.role,
    })
    .select("id")
    .single()

  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json(
        { error: "A profile already exists for this department and role." },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: "Failed to create profile." }, { status: 500 })
  }

  const profileId = (profile as { id: string }).id

  if (storeGrants.length > 0) {
    const { error: bundleError } = await supabase.from("access_profile_grants").insert(
      storeGrants.map((g) => ({
        access_profile_id: profileId,
        file_store_id: g.fileStoreId,
        permission: g.permission,
      }))
    )
    if (bundleError) {
      return NextResponse.json({ error: "Failed to save profile bundle." }, { status: 500 })
    }

    await resyncAllMembersForProfile(supabase, {
      orgId,
      departmentId: parsed.data.departmentId,
      role: parsed.data.role,
      profileId,
      grantedBy: session.user.id,
    })
  }

  await logAudit({
    orgId,
    actorId: session.user.id,
    action: "ACCESS_PROFILE_CREATED",
    targetType: "access_profile",
    targetId: profileId,
    metadata: { departmentId: parsed.data.departmentId, role: parsed.data.role, storeGrants },
  })

  return NextResponse.json({ id: profileId }, { status: 201 })
}
