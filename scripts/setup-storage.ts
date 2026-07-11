import { createClient } from "@supabase/supabase-js"
import { FILE_BUCKET, MAX_FILE_SIZE_BYTES } from "../src/lib/storage"

async function setup() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: buckets, error: listError } = await supabase.storage.listBuckets()
  if (listError) throw listError

  if (buckets?.some((b) => b.name === FILE_BUCKET)) {
    console.log(`Bucket "${FILE_BUCKET}" already exists — nothing to do.`)
    return
  }

  const { error } = await supabase.storage.createBucket(FILE_BUCKET, {
    public: false,
    fileSizeLimit: MAX_FILE_SIZE_BYTES,
  })
  if (error) throw error

  console.log(`Created private bucket "${FILE_BUCKET}".`)
}

setup().catch((err) => {
  console.error("Storage setup failed:", err)
  process.exit(1)
})
