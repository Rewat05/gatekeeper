import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { createSupabaseServiceClient } from "@/lib/supabase/server"
import { logAudit } from "@/lib/audit"
import { getFileStoreAccess } from "@/lib/file-store-access"
import { FILE_BUCKET } from "@/lib/storage"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: storeId, fileId } = await params
  const supabase = createSupabaseServiceClient()

  const access = await getFileStoreAccess(supabase, storeId, session.user.id)
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!access.canRead) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data: file } = await supabase
    .from("files")
    .select("id, storage_path, name")
    .eq("id", fileId)
    .eq("file_store_id", storeId)
    .maybeSingle()

  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { data: signed, error } = await supabase.storage
    .from(FILE_BUCKET)
    .createSignedUrl(file.storage_path as string, 60, { download: file.name as string })

  if (error || !signed) {
    return NextResponse.json({ error: "Failed to generate download link." }, { status: 500 })
  }

  await logAudit({
    orgId: access.store.org_id,
    actorId: session.user.id,
    action: "FILE_DOWNLOADED",
    targetType: "file",
    targetId: fileId,
    metadata: { fileStoreId: storeId },
  })

  return NextResponse.redirect(signed.signedUrl)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: storeId, fileId } = await params
  const supabase = createSupabaseServiceClient()

  const access = await getFileStoreAccess(supabase, storeId, session.user.id)
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!access.canWrite) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data: file } = await supabase
    .from("files")
    .select("id, storage_path, name")
    .eq("id", fileId)
    .eq("file_store_id", storeId)
    .maybeSingle()

  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await supabase.storage.from(FILE_BUCKET).remove([file.storage_path as string])

  const { error } = await supabase.from("files").delete().eq("id", fileId)
  if (error) return NextResponse.json({ error: "Delete failed." }, { status: 500 })

  await logAudit({
    orgId: access.store.org_id,
    actorId: session.user.id,
    action: "FILE_DELETED",
    targetType: "file",
    targetId: fileId,
    metadata: { fileStoreId: storeId, name: file.name },
  })

  return NextResponse.json({ ok: true })
}
