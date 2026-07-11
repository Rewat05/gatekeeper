import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { createSupabaseServiceClient } from "@/lib/supabase/server"
import { DepartmentForm } from "@/components/department-form"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"

type UserRecord = { id: string; name: string | null; email: string }

export default async function EditDepartmentPage({
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
  if (!["Owner", "Admin"].includes(caller.role as string)) redirect("/dashboard")

  const orgId = caller.org_id as string

  const [{ data: rawDept }, { data: rawMembers }] = await Promise.all([
    supabase
      .from("departments")
      .select("id, org_id, name, description, manager_id")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("org_members")
      .select("user_id")
      .eq("org_id", orgId)
      .eq("status", "Active"),
  ])

  if (!rawDept || (rawDept.org_id as string) !== orgId) redirect("/departments")

  const dept = rawDept as {
    id: string
    name: string
    description: string | null
    manager_id: string | null
  }

  type RawMember = { user_id: string }
  const memberUserIds = ((rawMembers ?? []) as RawMember[]).map((m) => m.user_id)

  let members: UserRecord[] = []
  if (memberUserIds.length > 0) {
    const { data } = await supabase.from("user").select("id, name, email").in("id", memberUserIds)
    members = (data ?? []) as UserRecord[]
  }

  return (
    <PageShell maxWidth="2xl">
      <PageHeader title="Edit Department" description={`Update the details for ${dept.name}.`} />
      <DepartmentForm
        mode="edit"
        members={members}
        departmentId={dept.id}
        initial={{
          name: dept.name,
          description: dept.description,
          managerId: dept.manager_id,
        }}
      />
    </PageShell>
  )
}
