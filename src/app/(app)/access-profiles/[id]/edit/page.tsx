import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { createSupabaseServiceClient } from "@/lib/supabase/server"
import { AccessProfileForm } from "@/components/access-profile-form"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"

export default async function EditAccessProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
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

  const { data: rawProfile } = await supabase
    .from("access_profiles")
    .select("id, org_id, department_id, role, departments(name)")
    .eq("id", id)
    .maybeSingle()

  if (!rawProfile || (rawProfile.org_id as string) !== orgId) redirect("/access-profiles")

  const profile = rawProfile as {
    id: string
    org_id: string
    department_id: string
    role: string
    departments: { name: string } | null
  }

  const [{ data: rawStores }, { data: rawBundle }] = await Promise.all([
    supabase.from("file_stores").select("id, name").eq("org_id", orgId).order("name"),
    supabase.from("access_profile_grants").select("file_store_id, permission").eq("access_profile_id", id),
  ])

  const fileStores = (rawStores ?? []) as { id: string; name: string }[]
  type BundleRow = { file_store_id: string; permission: string }
  const storeGrants = ((rawBundle ?? []) as BundleRow[]).map((g) => ({
    fileStoreId: g.file_store_id,
    permission: g.permission as "Read" | "Write",
  }))

  return (
    <PageShell maxWidth="2xl">
      <PageHeader
        title="Edit Access Profile"
        description="Editing the bundle immediately re-syncs access for every member currently matching this profile."
      />
      <AccessProfileForm
        mode="edit"
        profileId={profile.id}
        departments={[]}
        fileStores={fileStores}
        initial={{
          departmentName: profile.departments?.name ?? "—",
          role: profile.role,
          storeGrants,
        }}
      />
    </PageShell>
  )
}
