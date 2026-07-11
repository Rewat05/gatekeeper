import { createSupabaseServiceClient } from "@/lib/supabase/server"
import { expireStaleGrants } from "@/lib/grants"

type SupabaseService = ReturnType<typeof createSupabaseServiceClient>

type FileStoreAccess = {
  store: { id: string; org_id: string; classification: string }
  canRead: boolean
  canWrite: boolean
}

// Mirrors the read/write rules already used on the file-store pages:
// Owner/Admin always; Public to everyone; Internal to members of any of
// the store's tagged departments; otherwise an active access grant
// (Write grants also imply Read).
export async function getFileStoreAccess(
  supabase: SupabaseService,
  storeId: string,
  userId: string
): Promise<FileStoreAccess | null> {
  const { data: store } = await supabase
    .from("file_stores")
    .select("id, org_id, classification")
    .eq("id", storeId)
    .maybeSingle()

  if (!store) return null

  const { data: caller } = await supabase
    .from("org_members")
    .select("role, department_id")
    .eq("org_id", store.org_id)
    .eq("user_id", userId)
    .eq("status", "Active")
    .maybeSingle()

  if (!caller) return { store, canRead: false, canWrite: false }

  const role = caller.role as string
  const isAdmin = role === "Owner" || role === "Admin"

  let hasInherentAccess = isAdmin || store.classification === "Public"
  if (!hasInherentAccess && store.classification === "Internal" && caller.department_id) {
    const { data: tag } = await supabase
      .from("file_store_departments")
      .select("department_id")
      .eq("file_store_id", storeId)
      .eq("department_id", caller.department_id)
      .maybeSingle()
    hasInherentAccess = Boolean(tag)
  }

  await expireStaleGrants(supabase, { fileStoreId: storeId, userId })

  const { data: grant } = await supabase
    .from("access_grants")
    .select("permission")
    .eq("file_store_id", storeId)
    .eq("user_id", userId)
    .eq("status", "Active")
    .maybeSingle()

  return {
    store,
    canRead: isAdmin || hasInherentAccess || Boolean(grant),
    canWrite: isAdmin || grant?.permission === "Write",
  }
}
