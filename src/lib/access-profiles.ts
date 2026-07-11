import { createSupabaseServiceClient } from "@/lib/supabase/server"

type SupabaseService = ReturnType<typeof createSupabaseServiceClient>
type ProfileGrant = { file_store_id: string; permission: string }

// Only Manager/Member/Viewer ever carry a department, so those are the only
// roles a profile can match against.
export async function findAccessProfile(
  supabase: SupabaseService,
  orgId: string,
  departmentId: string,
  role: string
): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from("access_profiles")
    .select("id")
    .eq("org_id", orgId)
    .eq("department_id", departmentId)
    .eq("role", role)
    .maybeSingle()
  return data as { id: string } | null
}

// Fills in any store in the profile's bundle the member doesn't already have
// a grant for. Never overwrites an existing grant, manual or otherwise —
// auto-provisioning only fills gaps. Profile-sourced grants don't expire on
// a calendar date; their lifecycle is tied to holding the profile itself.
export async function provisionProfileForMember(
  supabase: SupabaseService,
  params: { orgId: string; userId: string; profileId: string; grantedBy: string }
): Promise<void> {
  const { data: bundle } = await supabase
    .from("access_profile_grants")
    .select("file_store_id, permission")
    .eq("access_profile_id", params.profileId)
  const grants = (bundle ?? []) as ProfileGrant[]
  if (grants.length === 0) return

  const { data: existing } = await supabase
    .from("access_grants")
    .select("file_store_id")
    .eq("org_id", params.orgId)
    .eq("user_id", params.userId)
    .in(
      "file_store_id",
      grants.map((g) => g.file_store_id)
    )
  const existingStoreIds = new Set(
    ((existing ?? []) as { file_store_id: string }[]).map((g) => g.file_store_id)
  )

  const toInsert = grants.filter((g) => !existingStoreIds.has(g.file_store_id))
  if (toInsert.length === 0) return

  await supabase.from("access_grants").insert(
    toInsert.map((g) => ({
      org_id: params.orgId,
      user_id: params.userId,
      file_store_id: g.file_store_id,
      permission: g.permission,
      granted_by: params.grantedBy,
      status: "Active",
      expires_at: null,
      source_profile_id: params.profileId,
    }))
  )
}

// Revokes every grant this member holds that came from this specific profile.
export async function deprovisionProfileForMember(
  supabase: SupabaseService,
  params: { userId: string; profileId: string }
): Promise<void> {
  await supabase
    .from("access_grants")
    .update({ status: "Revoked" })
    .eq("user_id", params.userId)
    .eq("source_profile_id", params.profileId)
    .eq("status", "Active")
}

// Called whenever a member's (department, role) changes: deprovision
// whatever profile they used to match, then provision whatever profile they
// match now. A no-op if neither dimension actually changed.
export async function resyncMemberProfile(
  supabase: SupabaseService,
  params: {
    orgId: string
    userId: string
    grantedBy: string
    oldDepartmentId: string | null
    oldRole: string
    newDepartmentId: string | null
    newRole: string
  }
): Promise<void> {
  if (params.oldDepartmentId === params.newDepartmentId && params.oldRole === params.newRole) {
    return
  }

  if (params.oldDepartmentId) {
    const oldProfile = await findAccessProfile(
      supabase,
      params.orgId,
      params.oldDepartmentId,
      params.oldRole
    )
    if (oldProfile) {
      await deprovisionProfileForMember(supabase, { userId: params.userId, profileId: oldProfile.id })
    }
  }

  if (params.newDepartmentId) {
    const newProfile = await findAccessProfile(
      supabase,
      params.orgId,
      params.newDepartmentId,
      params.newRole
    )
    if (newProfile) {
      await provisionProfileForMember(supabase, {
        orgId: params.orgId,
        userId: params.userId,
        profileId: newProfile.id,
        grantedBy: params.grantedBy,
      })
    }
  }
}

// Applies a profile's current bundle to every member who presently matches
// its department+role — used right after creating a profile, or after
// adding stores to an existing one.
export async function resyncAllMembersForProfile(
  supabase: SupabaseService,
  params: { orgId: string; departmentId: string; role: string; profileId: string; grantedBy: string }
): Promise<void> {
  const { data: members } = await supabase
    .from("org_members")
    .select("user_id")
    .eq("org_id", params.orgId)
    .eq("department_id", params.departmentId)
    .eq("role", params.role)
    .eq("status", "Active")

  const userIds = ((members ?? []) as { user_id: string }[]).map((m) => m.user_id)
  for (const userId of userIds) {
    await provisionProfileForMember(supabase, {
      orgId: params.orgId,
      userId,
      profileId: params.profileId,
      grantedBy: params.grantedBy,
    })
  }
}

// Revokes profile-sourced grants for specific stores that were just removed
// from a profile's bundle (used on edit).
export async function revokeProfileGrantsForStores(
  supabase: SupabaseService,
  params: { profileId: string; fileStoreIds: string[] }
): Promise<void> {
  if (params.fileStoreIds.length === 0) return
  await supabase
    .from("access_grants")
    .update({ status: "Revoked" })
    .eq("source_profile_id", params.profileId)
    .in("file_store_id", params.fileStoreIds)
    .eq("status", "Active")
}

// Revokes every grant sourced from a profile (used on profile delete).
export async function revokeAllProfileGrants(
  supabase: SupabaseService,
  profileId: string
): Promise<void> {
  await supabase
    .from("access_grants")
    .update({ status: "Revoked" })
    .eq("source_profile_id", profileId)
    .eq("status", "Active")
}
