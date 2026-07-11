"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"

export function FileUploadForm({ storeId }: { storeId: string }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const file = inputRef.current?.files?.[0]
    if (!file) return

    setError("")
    setLoading(true)

    const formData = new FormData()
    formData.append("file", file)

    const res = await fetch(`/api/file-stores/${storeId}/files`, {
      method: "POST",
      body: formData,
    })

    setLoading(false)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError((data as { error?: string }).error ?? "Upload failed.")
      return
    }

    if (inputRef.current) inputRef.current.value = ""
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <input
        ref={inputRef}
        type="file"
        required
        className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted/80"
      />
      <Button type="submit" size="sm" disabled={loading}>
        {loading ? "Uploading…" : "Upload file"}
      </Button>
    </form>
  )
}
