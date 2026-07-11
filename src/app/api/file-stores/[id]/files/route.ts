import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { createSupabaseServiceClient } from "@/lib/supabase/server"
import { logAudit } from "@/lib/audit"
import { getFileStoreAccess } from "@/lib/file-store-access"
import { FILE_BUCKET, MAX_FILE_SIZE_BYTES, buildStoragePath } from "@/lib/storage"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: storeId } = await params
  const supabase = createSupabaseServiceClient()

  const access = await getFileStoreAccess(supabase, storeId, session.user.id)
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!access.canWrite) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const formData = await request.formData()
  const file = formData.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 })
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty." }, { status: 400 })
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: "File exceeds the 25MB limit." }, { status: 413 })
  }

  const fileId = randomUUID()
  const storagePath = buildStoragePath(access.store.org_id, storeId, fileId)

  const { error: uploadError } = await supabase.storage
    .from(FILE_BUCKET)
    .upload(storagePath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    })

  if (uploadError) {
    return NextResponse.json({ error: "Upload failed." }, { status: 500 })
  }

  const { error: insertError } = await supabase.from("files").insert({
    id: fileId,
    file_store_id: storeId,
    org_id: access.store.org_id,
    name: file.name,
    storage_path: storagePath,
    uploaded_by: session.user.id,
    size_bytes: file.size,
    mime_type: file.type || null,
  })

  if (insertError) {
    await supabase.storage.from(FILE_BUCKET).remove([storagePath])
    return NextResponse.json({ error: "Failed to record upload." }, { status: 500 })
  }

  await logAudit({
    orgId: access.store.org_id,
    actorId: session.user.id,
    action: "FILE_UPLOADED",
    targetType: "file",
    targetId: fileId,
    metadata: { fileStoreId: storeId, name: file.name, sizeBytes: file.size },
  })

  return NextResponse.json({ id: fileId }, { status: 201 })
}
