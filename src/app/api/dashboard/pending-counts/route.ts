import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { createSupabaseServiceClient } from "@/lib/supabase/server"

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const supabase = createSupabaseServiceClient()
  const { data: membership } = await supabase
    .from("org_members")
    .select("role, org_id")
    .eq("user_id", session.user.id)
    .eq("status", "Active")
    .maybeSingle()

  if (!membership) {
    return NextResponse.json({ error: "No active membership" }, { status: 403 })
  }

  const role = membership.role as string
  const isAdmin = role === "Owner" || role === "Admin"
  if (!isAdmin) {
    return NextResponse.json({ pendingJoinCount: 0, pendingAccessCount: 0 })
  }

  const orgId = membership.org_id as string
  const [joinRes, accessRes] = await Promise.all([
    supabase
      .from("join_requests")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "Pending"),
    supabase
      .from("access_requests")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "Pending"),
  ])

  return NextResponse.json({
    pendingJoinCount: joinRes.count ?? 0,
    pendingAccessCount: accessRes.count ?? 0,
  })
}
