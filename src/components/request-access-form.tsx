"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"

export function RequestAccessForm({ storeId }: { storeId: string }) {
  const router = useRouter()
  const [permission, setPermission] = useState("Read")
  const [justification, setJustification] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    const res = await fetch("/api/access-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileStoreId: storeId,
        permissionRequested: permission,
        justification: justification || undefined,
      }),
    })

    setLoading(false)

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? "Failed to submit request.")
      return
    }

    setSubmitted(true)
    router.refresh()
  }

  if (submitted) {
    return (
      <Alert>
        <AlertDescription>
          Your request has been submitted. You&apos;ll be notified once it&apos;s reviewed.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="req-permission">Permission requested</Label>
          <select
            id="req-permission"
            value={permission}
            onChange={(e) => setPermission(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="Read">Read</option>
            <option value="Write">Write</option>
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="req-justification">
          Justification{" "}
          <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <textarea
          id="req-justification"
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
          placeholder="Explain why you need access to this resource…"
          rows={3}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
        />
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? "Submitting…" : "Request access"}
      </Button>
    </form>
  )
}
