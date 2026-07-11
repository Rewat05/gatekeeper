import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { Users, Building2, ClipboardList, ShieldCheck } from "lucide-react"
import { auth } from "@/lib/auth"
import { createSupabaseServiceClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { PendingRequestCards } from "@/components/pending-request-cards"
import { SoftAuroraBackground } from "@/components/soft-aurora-background"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"
import { expireStaleGrants } from "@/lib/grants"
import { cn } from "@/lib/utils"

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/auth/login")

  const supabase = createSupabaseServiceClient()
  const { data: membership } = await supabase
    .from("org_members")
    .select("role, org_id, department_id, departments(name), organizations(name, org_code)")
    .eq("user_id", session.user.id)
    .eq("status", "Active")
    .maybeSingle()

  if (!membership) redirect("/onboarding")

  const orgId = membership.org_id as string
  const role = membership.role as string
  const isAdmin = role === "Owner" || role === "Admin"
  const org = membership.organizations as { name: string; org_code: string } | null
  const department = membership.departments as { name: string } | null

  await expireStaleGrants(supabase, { userId: session.user.id, orgId })

  // Parallel stat fetches
  const [memberRes, deptRes, myGrantRes, myPendingRes] = await Promise.all([
    supabase
      .from("org_members")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "Active"),
    supabase
      .from("departments")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId),
    supabase
      .from("access_grants")
      .select("id", { count: "exact", head: true })
      .eq("user_id", session.user.id)
      .eq("status", "Active"),
    supabase
      .from("access_requests")
      .select("id", { count: "exact", head: true })
      .eq("requester_id", session.user.id)
      .eq("status", "Pending"),
  ])

  let pendingJoinCount = 0
  let pendingAccessCount = 0
  if (isAdmin) {
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
    pendingJoinCount = joinRes.count ?? 0
    pendingAccessCount = accessRes.count ?? 0
  }

  const stats = [
    {
      title: "Active Members",
      value: memberRes.count ?? 0,
      icon: Users,
      alert: false,
    },
    {
      title: "Departments",
      value: deptRes.count ?? 0,
      icon: Building2,
      alert: false,
    },
    {
      title: "Your Active Grants",
      value: myGrantRes.count ?? 0,
      icon: ShieldCheck,
      alert: false,
    },
    {
      title: "Your Pending Requests",
      value: myPendingRes.count ?? 0,
      icon: ClipboardList,
      alert: false,
    },
  ]

  return (
    <div className="relative min-h-full">
      <SoftAuroraBackground />
      <PageShell maxWidth="5xl" spacing="space-y-8" className="relative z-10">
        <PageHeader
          title="Dashboard"
          description={`Welcome back, ${session.user.name ?? session.user.email}`}
        />

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.title}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{stat.title}</p>
                    <p className="text-2xl font-semibold mt-1">{stat.value}</p>
                  </div>
                  <div
                    className={cn(
                      "p-2 rounded-md",
                      stat.alert ? "bg-destructive/10" : "bg-muted"
                    )}
                  >
                    <stat.icon
                      className={cn(
                        "size-4",
                        stat.alert ? "text-destructive" : "text-muted-foreground"
                      )}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {isAdmin && (
            <PendingRequestCards
              initialJoinCount={pendingJoinCount}
              initialAccessCount={pendingAccessCount}
            />
          )}
        </div>

        {role === "Owner" && org && (
          <Card className="max-w-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Organisation Code</CardTitle>
              <CardDescription className="text-xs">
                Share this with colleagues so they can request to join.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="font-mono text-xl font-bold tracking-widest text-foreground">
                {org.org_code}
              </p>
            </CardContent>
          </Card>
        )}

        {!isAdmin && (
          <Card className="max-w-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Your Department</CardTitle>
              <CardDescription className="text-xs">
                {role === "Manager"
                  ? "Members, requests, and grants you can manage are scoped to this department."
                  : "The department your access and visibility are scoped to."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold text-foreground">
                {department?.name ?? "Not yet assigned"}
              </p>
            </CardContent>
          </Card>
        )}
      </PageShell>
    </div>
  )
}
