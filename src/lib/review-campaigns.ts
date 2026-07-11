import { createSupabaseServiceClient } from "@/lib/supabase/server"

type SupabaseService = ReturnType<typeof createSupabaseServiceClient>

// Self-healing: flip any campaign whose closes_at has passed from Active to
// Closed before it's read, so "only one Active campaign per org" doesn't
// permanently lock an org out of ever starting another one. There's no
// scheduler in this app, so this runs lazily wherever campaign status
// matters, mirroring expireStaleGrants for access_grants.
export async function closeExpiredCampaigns(supabase: SupabaseService, orgId: string): Promise<void> {
  await supabase
    .from("review_campaigns")
    .update({ status: "Closed" })
    .eq("org_id", orgId)
    .eq("status", "Active")
    .lt("closes_at", new Date().toISOString())
}
