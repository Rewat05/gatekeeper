import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { createSupabaseServiceClient } from "@/lib/supabase/server"
import { Separator } from "@/components/ui/separator"
import { SettingsForm } from "@/components/settings-form"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"

export default async function SettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/auth/login")

  const supabase = createSupabaseServiceClient()

  const { data: caller } = await supabase
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", session.user.id)
    .eq("status", "Active")
    .maybeSingle()

  if (!caller) redirect("/onboarding")
  if ((caller.role as string) !== "Owner") redirect("/dashboard")

  const orgId = caller.org_id as string

  const { data: rawOrg } = await supabase
    .from("organizations")
    .select("id, name, domain, org_code")
    .eq("id", orgId)
    .maybeSingle()

  if (!rawOrg) redirect("/dashboard")

  const org = rawOrg as { id: string; name: string; domain: string | null; org_code: string }

  return (
    <PageShell maxWidth="2xl" spacing="space-y-8">
      <PageHeader title="Settings" />

      <div className="space-y-1">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
          Organisation code
        </p>
        <p className="font-mono text-lg font-semibold tracking-wider">{org.org_code}</p>
        <p className="text-xs text-muted-foreground">
          Share this code so people can request to join your organisation.
        </p>
      </div>

      <Separator />

      <div className="space-y-4">
        <h2 className="text-base font-semibold">Organisation details</h2>
        <SettingsForm initialName={org.name} initialDomain={org.domain ?? ""} />
      </div>
    </PageShell>
  )
}
