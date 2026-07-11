import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { createSupabaseServiceClient } from "@/lib/supabase/server"
import { expireStaleGrants } from "@/lib/grants"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { GrantAccessForm } from "@/components/grant-access-form"
import { RevokeGrantButton } from "@/components/revoke-grant-button"
import { RequestAccessForm } from "@/components/request-access-form"
import { FileUploadForm } from "@/components/file-upload-form"
import { DeleteFileButton } from "@/components/delete-file-button"
import { AutoRefresh } from "@/components/auto-refresh"
import { PageShell } from "@/components/page-shell"

type UserRecord = { id: string; name: string | null; email: string }
type ExplicitGrant = { permission: string; expires_at: string | null }
type PendingAccessRequest = { id: string; permission_requested: string; created_at: string }
type RawGrant = {
  id: string
  user_id: string
  permission: string
  granted_by: string
  expires_at: string | null
  created_at: string
}
type RawFile = {
  id: string
  name: string
  size_bytes: number | null
  mime_type: string | null
  uploaded_by: string
  created_at: string
}

function classificationVariant(c: string) {
  if (c === "Restricted") return "destructive" as const
  if (c === "Confidential") return "default" as const
  if (c === "Internal") return "secondary" as const
  return "outline" as const
}

function fmt(date: string) {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function formatBytes(bytes: number | null) {
  if (bytes === null) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default async function FileStoreDetailPage({
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
    .select("org_id, role, department_id")
    .eq("user_id", session.user.id)
    .eq("status", "Active")
    .maybeSingle()

  if (!caller) redirect("/onboarding")

  const callerRole = caller.role as string
  const callerOrgId = caller.org_id as string
  const callerDeptId = caller.department_id as string | null
  const isAdmin = callerRole === "Owner" || callerRole === "Admin"

  const { data: rawStore } = await supabase
    .from("file_stores")
    .select("id, org_id, name, description, classification, created_at")
    .eq("id", id)
    .maybeSingle()

  if (!rawStore || (rawStore.org_id as string) !== callerOrgId) redirect("/file-stores")

  const store = rawStore as {
    id: string
    org_id: string
    name: string
    description: string | null
    classification: string
    created_at: string
  }

  const { data: tagRows } = await supabase
    .from("file_store_departments")
    .select("department_id, departments(name)")
    .eq("file_store_id", id)
  type TagRow = { department_id: string; departments: { name: string } | null }
  const storeDeptTags = (tagRows ?? []) as TagRow[]
  const storeDeptIds = storeDeptTags.map((t) => t.department_id)
  const storeDeptNames = storeDeptTags.map((t) => t.departments?.name ?? "—")

  // Managers can only manage grants for file stores tagged with their own department.
  const canManageGrants =
    isAdmin ||
    (callerRole === "Manager" && callerDeptId !== null && storeDeptIds.includes(callerDeptId))

  // Determine if the non-admin user has inherent access (no explicit grant needed)
  const hasInherentAccess =
    isAdmin ||
    store.classification === "Public" ||
    (store.classification === "Internal" && callerDeptId !== null && storeDeptIds.includes(callerDeptId))

  // Self-heal any grants on this store that have quietly passed their expiry
  // before anything below reads "status = Active" for real access decisions.
  await expireStaleGrants(supabase, { fileStoreId: id })

  // For non-admins without inherent access: check for explicit grant + pending request
  let myExplicitGrant: ExplicitGrant | null = null
  let myPendingRequest: PendingAccessRequest | null = null

  if (!isAdmin && !hasInherentAccess) {
    const [grantRes, requestRes] = await Promise.all([
      supabase
        .from("access_grants")
        .select("permission, expires_at")
        .eq("file_store_id", id)
        .eq("user_id", session.user.id)
        .eq("status", "Active")
        .maybeSingle(),
      supabase
        .from("access_requests")
        .select("id, permission_requested, created_at")
        .eq("file_store_id", id)
        .eq("requester_id", session.user.id)
        .eq("status", "Pending")
        .maybeSingle(),
    ])
    myExplicitGrant = grantRes.data as ExplicitGrant | null
    myPendingRequest = requestRes.data as PendingAccessRequest | null
  }

  // Fetch active grants
  const { data: rawGrants } = await supabase
    .from("access_grants")
    .select("id, user_id, permission, granted_by, expires_at, created_at")
    .eq("file_store_id", id)
    .eq("status", "Active")
    .order("created_at")

  const grants = (rawGrants ?? []) as RawGrant[]

  // Fetch user details for all referenced user IDs
  const allIds = [...new Set([...grants.map((g) => g.user_id), ...grants.map((g) => g.granted_by)])]
  let userRecords: UserRecord[] = []
  if (allIds.length > 0) {
    const { data } = await supabase.from("user").select("id, name, email").in("id", allIds)
    userRecords = (data ?? []) as UserRecord[]
  }
  const userMap = new Map(userRecords.map((u) => [u.id, u]))

  const grantRows = grants.map((g) => ({
    id: g.id,
    grantee: userMap.get(g.user_id),
    grantor: userMap.get(g.granted_by),
    permission: g.permission,
    expiresAt: g.expires_at,
  }))

  const myGrant = grants.find((g) => g.user_id === session.user.id)

  const hasReadAccess = isAdmin || hasInherentAccess || Boolean(myGrant)
  const canWriteFiles = isAdmin || myGrant?.permission === "Write"

  // Fetch files in this store (only meaningful to query if the caller can see them)
  let fileRows: RawFile[] = []
  if (hasReadAccess) {
    const { data: rawFiles } = await supabase
      .from("files")
      .select("id, name, size_bytes, mime_type, uploaded_by, created_at")
      .eq("file_store_id", id)
      .order("created_at", { ascending: false })
    fileRows = (rawFiles ?? []) as RawFile[]
  }

  const uploaderIds = [...new Set(fileRows.map((f) => f.uploaded_by))]
  let uploaderRecords: UserRecord[] = []
  if (uploaderIds.length > 0) {
    const { data } = await supabase.from("user").select("id, name, email").in("id", uploaderIds)
    uploaderRecords = (data ?? []) as UserRecord[]
  }
  const uploaderMap = new Map(uploaderRecords.map((u) => [u.id, u]))

  return (
    <PageShell maxWidth="4xl" spacing="space-y-8">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{store.name}</h1>
            {store.description && (
              <p className="text-sm text-muted-foreground mt-1">{store.description}</p>
            )}
          </div>
          <Badge variant={classificationVariant(store.classification)}>
            {store.classification}
          </Badge>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>Departments: {storeDeptNames.length > 0 ? storeDeptNames.join(", ") : "—"}</span>
          <span>Created {fmt(store.created_at)}</span>
        </div>
      </div>

      <Separator />

      {/* My access (for non-admins) */}
      {!isAdmin && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Your access</h2>

          {hasInherentAccess ? (
            // Public or dept-internal: no grant needed
            <div className="space-y-1">
              {myGrant ? (
                <div className="flex items-center gap-2">
                  <Badge variant={myGrant.permission === "Write" ? "default" : "outline"}>
                    {myGrant.permission}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {myGrant.expires_at ? `Expires ${fmt(myGrant.expires_at)}` : "No expiry"}
                  </span>
                </div>
              ) : store.classification === "Public" ? (
                <p className="text-sm text-muted-foreground">
                  Accessible to all org members (Read).
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Accessible to your department (Read).
                </p>
              )}
            </div>
          ) : myExplicitGrant ? (
            // Has an explicit grant
            <div className="flex items-center gap-2">
              <Badge variant={myExplicitGrant.permission === "Write" ? "default" : "outline"}>
                {myExplicitGrant.permission}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {myExplicitGrant.expires_at
                  ? `Expires ${fmt(myExplicitGrant.expires_at)}`
                  : "No expiry"}
              </span>
            </div>
          ) : myPendingRequest ? (
            // Has a pending request — poll so approval/denial elsewhere
            // updates this banner without needing a manual reload.
            <div className="rounded-lg border border-dashed p-4 space-y-1">
              <AutoRefresh />
              <p className="text-sm font-medium">Request pending review</p>
              <p className="text-xs text-muted-foreground">
                Requested {myPendingRequest.permission_requested} access on{" "}
                {fmt(myPendingRequest.created_at)}. You&apos;ll be notified once it&apos;s
                reviewed.
              </p>
            </div>
          ) : (
            // No access — show request form
            <div className="rounded-lg border p-5 space-y-3">
              <div>
                <p className="text-sm font-medium">Access required</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Request access to this{" "}
                  {store.classification.toLowerCase()} resource.
                </p>
              </div>
              <RequestAccessForm storeId={id} />
            </div>
          )}
        </div>
      )}

      {hasReadAccess && (
        <>
          <Separator />

          {/* Files */}
          <div className="space-y-5">
            <h2 className="text-base font-semibold">
              Files{" "}
              <span className="text-sm font-normal text-muted-foreground">
                ({fileRows.length})
              </span>
            </h2>

            {fileRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No files uploaded yet.</p>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">
                        Name
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">
                        Size
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">
                        Uploaded by
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">
                        Uploaded
                      </th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {fileRows.map((file) => {
                      const uploader = uploaderMap.get(file.uploaded_by)
                      return (
                        <tr key={file.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 font-medium">{file.name}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {formatBytes(file.size_bytes)}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {uploader?.name ?? uploader?.email ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                            {fmt(file.created_at)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 justify-end">
                              <a
                                href={`/api/file-stores/${id}/files/${file.id}`}
                                className="text-xs font-medium text-primary hover:underline"
                              >
                                Download
                              </a>
                              {canWriteFiles && <DeleteFileButton storeId={id} fileId={file.id} />}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {canWriteFiles && (
              <div className="rounded-lg border p-5 space-y-3">
                <h3 className="text-sm font-medium">Upload file</h3>
                <FileUploadForm storeId={id} />
              </div>
            )}
          </div>
        </>
      )}

      {/* Grants management */}
      {canManageGrants && (
        <div className="space-y-5">
          <h2 className="text-base font-semibold">
            Access grants{" "}
            <span className="text-sm font-normal text-muted-foreground">
              ({grantRows.length})
            </span>
          </h2>

          {grantRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No explicit grants yet.</p>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">
                      Member
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">
                      Permission
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">
                      Expires
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">
                      Granted by
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {grantRows.map((row) => (
                    <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium">{row.grantee?.name ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{row.grantee?.email ?? ""}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={row.permission === "Write" ? "default" : "outline"}>
                          {row.permission}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {row.expiresAt ? fmt(row.expiresAt) : "Never"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {row.grantor?.name ?? row.grantor?.email ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <RevokeGrantButton storeId={id} grantId={row.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="rounded-lg border p-5 space-y-3">
            <h3 className="text-sm font-medium">Grant access</h3>
            <GrantAccessForm storeId={id} />
          </div>
        </div>
      )}
    </PageShell>
  )
}
