import { headers } from "next/headers"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Plus, Pencil } from "lucide-react"
import { auth } from "@/lib/auth"
import { createSupabaseServiceClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { DeleteAccessProfileButton } from "@/components/delete-access-profile-button"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"

type RawProfile = { id: string; department_id: string; role: string; departments: { name: string } | null }

export default async function AccessProfilesPage() {
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
  if (!["Owner", "Admin"].includes(caller.role as string)) redirect("/dashboard")

  const orgId = caller.org_id as string

  const { data: rawProfiles } = await supabase
    .from("access_profiles")
    .select("id, department_id, role, departments(name)")
    .eq("org_id", orgId)
    .order("created_at")

  const profiles = (rawProfiles ?? []) as RawProfile[]
  const profileIds = profiles.map((p) => p.id)

  const bundleCounts = new Map<string, number>()
  if (profileIds.length > 0) {
    const { data: bundleRows } = await supabase
      .from("access_profile_grants")
      .select("access_profile_id")
      .in("access_profile_id", profileIds)
    type BundleRow = { access_profile_id: string }
    ;((bundleRows ?? []) as BundleRow[]).forEach((row) => {
      bundleCounts.set(row.access_profile_id, (bundleCounts.get(row.access_profile_id) ?? 0) + 1)
    })
  }

  return (
    <PageShell maxWidth="4xl">
      <PageHeader
        title="Access Profiles"
        meta={<span className="text-sm text-muted-foreground">{profiles.length} total</span>}
        description="Auto-provisioning bundles: assign a member a profile's department + role and they automatically get the bundled file-store access."
        actions={
          <Button asChild>
            <Link href="/access-profiles/new">
              <Plus className="size-4" />
              New profile
            </Link>
          </Button>
        }
      />

      {profiles.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-sm font-medium">No access profiles yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Create a profile to auto-provision file-store access whenever a member is assigned a
            given department and role.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Department</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Role</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Bundled stores</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {profiles.map((profile) => (
                <tr key={profile.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">{profile.departments?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{profile.role}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {bundleCounts.get(profile.id) ?? 0}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/access-profiles/${profile.id}/edit`}>
                          <Pencil className="size-3.5" />
                          Edit
                        </Link>
                      </Button>
                      <DeleteAccessProfileButton profileId={profile.id} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  )
}
