import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { createSupabaseServiceClient } from "@/lib/supabase/server"
import { OnboardingFlow } from "@/components/onboarding-flow"

export default async function OnboardingPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/auth/login")

  const supabase = createSupabaseServiceClient()

  const { data: membership } = await supabase
    .from("org_members")
    .select("id")
    .eq("user_id", session.user.id)
    .eq("status", "Active")
    .maybeSingle()

  // Already belongs to an org — nothing to onboard.
  if (membership) redirect("/dashboard")

  // A previously submitted join request is real, persisted state. Without
  // this check, reloading this page would silently drop back to the
  // chooser and make it look like the request never went through.
  const { data: pendingRequest } = await supabase
    .from("join_requests")
    .select("organizations(name)")
    .eq("requester_id", session.user.id)
    .eq("status", "Pending")
    .maybeSingle()

  const pendingOrgName =
    (pendingRequest?.organizations as { name: string } | null)?.name ?? null

  return <OnboardingFlow initialPendingOrgName={pendingOrgName} />
}
