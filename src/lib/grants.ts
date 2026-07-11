import { createSupabaseServiceClient } from "@/lib/supabase/server"

type SupabaseService = ReturnType<typeof createSupabaseServiceClient>

export const DEFAULT_GRANT_EXPIRY_DAYS = 7

export function defaultGrantExpiry(): string {
  return new Date(Date.now() + DEFAULT_GRANT_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

// Self-healing: flip any grant whose expires_at has passed from Active to
// Expired before it's read, so every "status = Active" query downstream
// (access checks, grant lists, counts) reflects reality without needing a
// separate cron job. Scope with whichever filters are available to keep
// each call cheap.
export async function expireStaleGrants(
  supabase: SupabaseService,
  filters: { fileStoreId?: string; userId?: string; orgId?: string }
): Promise<void> {
  let query = supabase
    .from("access_grants")
    .update({ status: "Expired" })
    .eq("status", "Active")
    .not("expires_at", "is", null)
    .lte("expires_at", new Date().toISOString())

  if (filters.fileStoreId) query = query.eq("file_store_id", filters.fileStoreId)
  if (filters.userId) query = query.eq("user_id", filters.userId)
  if (filters.orgId) query = query.eq("org_id", filters.orgId)

  await query
}
