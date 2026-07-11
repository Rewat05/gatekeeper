"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"

export function GrantAccessForm({ storeId }: { storeId: string }) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [permission, setPermission] = useState("Read")
  const [expiresAt, setExpiresAt] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    const res = await fetch(`/api/file-stores/${storeId}/grants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        permission,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      }),
    })

    setLoading(false)

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? "Failed to grant access.")
      return
    }

    setEmail("")
    setExpiresAt("")
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="grant-email">Member email</Label>
          <Input
            id="grant-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@company.com"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="grant-permission">Permission</Label>
          <select
            id="grant-permission"
            value={permission}
            onChange={(e) => setPermission(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="Read">Read</option>
            <option value="Write">Write</option>
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="grant-expires">
            Expires{" "}
            <span className="text-muted-foreground font-normal">(defaults to 7 days)</span>
          </Label>
          <Input
            id="grant-expires"
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            min={new Date().toISOString().split("T")[0]}
          />
        </div>
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? "Granting…" : "Grant access"}
      </Button>
    </form>
  )
}
