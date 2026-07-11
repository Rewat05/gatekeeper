import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { createSupabaseServiceClient } from "@/lib/supabase/server"
import { NewFileStoreForm } from "@/components/new-file-store-form"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"

export default async function NewFileStorePage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/auth/login")

  const supabase = createSupabaseServiceClient()

  const { data: caller } = await supabase
    .from("org_members")
    .select("org_id, role, department_id, departments(name)")
    .eq("user_id", session.user.id)
    .eq("status", "Active")
    .maybeSingle()

  if (!caller) redirect("/onboarding")
  if (!["Owner", "Admin", "Manager"].includes(caller.role as string)) redirect("/file-stores")

  const { data: rawDepts } = await supabase
    .from("departments")
    .select("id, name")
    .eq("org_id", caller.org_id)
    .order("name")

  const departments = (rawDepts ?? []) as { id: string; name: string }[]
  const callerDept = caller.departments as { name: string } | null

  return (
    <PageShell maxWidth="lg">
      <PageHeader
        title="New file store"
        description="Create a new resource container with access controls."
      />
      <NewFileStoreForm
        departments={departments}
        callerRole={caller.role as string}
        callerDeptId={caller.department_id as string | null}
        callerDeptName={callerDept?.name ?? null}
      />
    </PageShell>
  )
}
