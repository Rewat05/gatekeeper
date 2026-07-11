export const FILE_BUCKET = "file-uploads"
export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024 // 25MB

export function buildStoragePath(orgId: string, fileStoreId: string, fileId: string) {
  return `${orgId}/${fileStoreId}/${fileId}`
}
