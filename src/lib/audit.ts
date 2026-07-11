import { createSupabaseServiceClient } from "@/lib/supabase/server"

interface AuditEntry {
  orgId: string
  actorId: string
  action: string
  targetType?: string
  targetId?: string
  metadata?: Record<string, unknown>
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const supabase = createSupabaseServiceClient()
    await supabase.from("audit_log").insert({
      org_id: entry.orgId,
      actor_id: entry.actorId,
      action: entry.action,
      target_type: entry.targetType ?? null,
      target_id: entry.targetId ?? null,
      metadata: entry.metadata ?? null,
    })
  } catch {
    // Audit logging must never break the main request
  }
}
