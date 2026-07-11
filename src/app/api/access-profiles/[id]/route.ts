import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { createSupabaseServiceClient } from "@/lib/supabase/server"
import { logAudit } from "@/lib/audit"
import { resyncAllMembersForProfile, revokeAllProfileGrants, revokeProfileGrantsForStores } from "@/lib/access-profiles"

const patchSchema = z.object({
  storeGrants: z.array(
    z.object({
      fileStoreId: z.string().uuid(),
      permission: z.enum(["Read", "Write"]),
    })
  ),
})

async function getCallerAndProfile(
  userId: string,
  profileId: string,
  supabase: ReturnType<typeof createSupabaseServiceClient>
) {
  const [callerRes, profileRes] = await Promise.all([
    supabase
      .from("org_members")
      .select("org_id, role")
      .eq("user_id", userId)
      .eq("status", "Active")
      .maybeSingle(),
    supabase
      .from("access_profiles")
      .select("id, org_id, department_id, role")
      .eq("id", profileId)
      .maybeSingle(),
  ])
  return {
    caller: callerRes.data as { org_id: string; role: string } | null,
    profile: profileRes.data as
      | { id: string; org_id: string; department_id: string; role: string }
      | null,
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
  const { caller, profile } = await getCallerAndProfile(session.user.id, id, supabase)

  if (!caller || !["Owner", "Admin"].includes(caller.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (!profile || profile.org_id !== caller.org_id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const storeGrants = [...new Map(parsed.data.storeGrants.map((g) => [g.fileStoreId, g])).values()]

  if (storeGrants.length > 0) {
    const { data: validStores } = await supabase
      .from("file_stores")
      .select("id")
      .eq("org_id", caller.org_id)
      .in(
        "id",
        storeGrants.map((g) => g.fileStoreId)
      )
    const validIds = new Set(((validStores ?? []) as { id: string }[]).map((s) => s.id))
    if (storeGrants.some((g) => !validIds.has(g.fileStoreId))) {
      return NextResponse.json({ error: "Invalid file store." }, { status: 400 })
    }
  }

  const { data: currentBundle } = await supabase
    .from("access_profile_grants")
    .select("file_store_id")
    .eq("access_profile_id", id)
  const currentStoreIds = ((currentBundle ?? []) as { file_store_id: string }[]).map(
    (g) => g.file_store_id
  )
  const newStoreIds = new Set(storeGrants.map((g) => g.fileStoreId))
  const removedStoreIds = currentStoreIds.filter((storeId) => !newStoreIds.has(storeId))

  // Revoke access for stores dropped from the bundle before replacing it.
  await revokeProfileGrantsForStores(supabase, { profileId: id, fileStoreIds: removedStoreIds })

  await supabase.from("access_profile_grants").delete().eq("access_profile_id", id)
  if (storeGrants.length > 0) {
    const { error: bundleError } = await supabase.from("access_profile_grants").insert(
      storeGrants.map((g) => ({
        access_profile_id: id,
        file_store_id: g.fileStoreId,
        permission: g.permission,
      }))
    )
    if (bundleError) {
      return NextResponse.json({ error: "Failed to update profile bundle." }, { status: 500 })
    }
  }

  // Fill in any newly added stores for members who currently match this profile.
  await resyncAllMembersForProfile(supabase, {
    orgId: profile.org_id,
    departmentId: profile.department_id,
    role: profile.role,
    profileId: id,
    grantedBy: session.user.id,
  })

  await logAudit({
    orgId: caller.org_id,
    actorId: session.user.id,
    action: "ACCESS_PROFILE_UPDATED",
    targetType: "access_profile",
    targetId: id,
    metadata: { storeGrants },
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
  const { caller, profile } = await getCallerAndProfile(session.user.id, id, supabase)

  if (!caller || !["Owner", "Admin"].includes(caller.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (!profile || profile.org_id !== caller.org_id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  await revokeAllProfileGrants(supabase, id)

  const { error } = await supabase.from("access_profiles").delete().eq("id", id)
  if (error) return NextResponse.json({ error: "Failed to delete profile." }, { status: 500 })

  await logAudit({
    orgId: caller.org_id,
    actorId: session.user.id,
    action: "ACCESS_PROFILE_DELETED",
    targetType: "access_profile",
    targetId: id,
  })

  return NextResponse.json({ ok: true })
}
