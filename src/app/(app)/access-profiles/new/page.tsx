import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { createSupabaseServiceClient } from "@/lib/supabase/server"
import { AccessProfileForm } from "@/components/access-profile-form"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"

export default async function NewAccessProfilePage() {
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
  if (!["Owner", "Admin"].includes(caller.role as string)) redirect("/access-profiles")

  const orgId = caller.org_id as string

  const [{ data: rawDepts }, { data: rawStores }] = await Promise.all([
    supabase.from("departments").select("id, name").eq("org_id", orgId).order("name"),
    supabase.from("file_stores").select("id, name").eq("org_id", orgId).order("name"),
  ])

  const departments = (rawDepts ?? []) as { id: string; name: string }[]
  const fileStores = (rawStores ?? []) as { id: string; name: string }[]

  if (departments.length === 0) {
    return (
      <PageShell maxWidth="2xl">
        <PageHeader title="New Access Profile" />
        <p className="text-sm text-muted-foreground">
          Create a department first — access profiles are tied to one.
        </p>
      </PageShell>
    )
  }

  return (
    <PageShell maxWidth="2xl">
      <PageHeader
        title="New Access Profile"
        description="Bundle file-store access to auto-grant whenever a member has this department + role."
      />
      <AccessProfileForm mode="create" departments={departments} fileStores={fileStores} />
    </PageShell>
  )
}
