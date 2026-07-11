import { headers } from "next/headers"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Plus, Lock } from "lucide-react"
import { auth } from "@/lib/auth"
import { createSupabaseServiceClient } from "@/lib/supabase/server"
import { expireStaleGrants } from "@/lib/grants"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"

type RawStore = {
  id: string
  name: string
  description: string | null
  classification: string
  created_at: string
}

function classificationVariant(c: string) {
  if (c === "Restricted") return "destructive" as const
  if (c === "Confidential") return "default" as const
  if (c === "Internal") return "secondary" as const
  return "outline" as const
}

export default async function FileStoresPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/auth/login")

  const supabase = createSupabaseServiceClient()

  const { data: caller } = await supabase
    .from("org_members")
    .select("org_id, role, department_id")
    .eq("user_id", session.user.id)
    .eq("status", "Active")
    .maybeSingle()

  if (!caller) redirect("/onboarding")

  const orgId = caller.org_id as string
  const callerRole = caller.role as string
  const callerDeptId = caller.department_id as string | null
  const isAdmin = callerRole === "Owner" || callerRole === "Admin"

  // Always fetch all stores — non-admins see everything but with access indicators
  const { data: rawStores } = await supabase
    .from("file_stores")
    .select("id, name, description, classification, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
  const stores = (rawStores ?? []) as RawStore[]

  // Department tags for every store, so we can show them and compute Internal access
  const storeIds = stores.map((s) => s.id)
  const deptNamesByStore = new Map<string, string[]>()
  const deptIdsByStore = new Map<string, string[]>()
  if (storeIds.length > 0) {
    const { data: tagRows } = await supabase
      .from("file_store_departments")
      .select("file_store_id, department_id, departments(name)")
      .in("file_store_id", storeIds)
    type TagRow = { file_store_id: string; department_id: string; departments: { name: string } | null }
    ;((tagRows ?? []) as TagRow[]).forEach((row) => {
      deptIdsByStore.set(row.file_store_id, [
        ...(deptIdsByStore.get(row.file_store_id) ?? []),
        row.department_id,
      ])
      deptNamesByStore.set(row.file_store_id, [
        ...(deptNamesByStore.get(row.file_store_id) ?? []),
        row.departments?.name ?? "—",
      ])
    })
  }

  // For non-admins: compute which stores they can already access
  const grantedStoreIds = new Set<string>()
  if (!isAdmin) {
    await expireStaleGrants(supabase, { userId: session.user.id, orgId })
    const { data: grantData } = await supabase
      .from("access_grants")
      .select("file_store_id")
      .eq("user_id", session.user.id)
      .eq("status", "Active")
    type GrantRow = { file_store_id: string }
    const typedGrants = (grantData ?? []) as GrantRow[]
    typedGrants.forEach((g) => grantedStoreIds.add(g.file_store_id))
  }

  function hasAccess(store: RawStore): boolean {
    if (isAdmin) return true
    if (store.classification === "Public") return true
    if (store.classification === "Internal" && callerDeptId) {
      const deptIds = deptIdsByStore.get(store.id) ?? []
      if (deptIds.includes(callerDeptId)) return true
    }
    return grantedStoreIds.has(store.id)
  }

  return (
    <PageShell maxWidth="5xl">
      <PageHeader
        title="File Stores"
        meta={<span className="text-sm text-muted-foreground">{stores.length} total</span>}
        actions={
          (isAdmin || callerRole === "Manager") && (
            <Button asChild>
              <Link href="/file-stores/new">
                <Plus className="size-4" />
                New file store
              </Link>
            </Button>
          )
        }
      />

      {stores.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-sm font-medium">No file stores yet</p>
          {(isAdmin || callerRole === "Manager") && (
            <p className="text-xs text-muted-foreground mt-1">
              Create your first file store to start managing access to resources.
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stores.map((store) => {
            const accessible = hasAccess(store)
            return (
              <Link key={store.id} href={`/file-stores/${store.id}`} className="block">
                <Card className="h-full hover:border-foreground/20 transition-colors cursor-pointer">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base leading-tight">{store.name}</CardTitle>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {!accessible && (
                          <Lock className="size-3 text-muted-foreground" />
                        )}
                        <Badge variant={classificationVariant(store.classification)}>
                          {store.classification}
                        </Badge>
                      </div>
                    </div>
                    {store.description && (
                      <CardDescription className="line-clamp-2 text-xs">
                        {store.description}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground space-y-0.5">
                    <p>{(deptNamesByStore.get(store.id) ?? []).join(", ") || "No department"}</p>
                    <p>
                      Created{" "}
                      {new Date(store.created_at).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </PageShell>
  )
}
