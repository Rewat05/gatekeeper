"use client"

import Link from "next/link"
import { useState } from "react"
import { requestPasswordReset } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AuthPageShell } from "@/components/auth-page-shell"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    const { error } = await requestPasswordReset({
      email,
      redirectTo: "/auth/reset-password",
    })

    setLoading(false)

    if (error) {
      setError(error.message ?? "Failed to send. Please try again.")
      return
    }

    setSent(true)
  }

  return (
    <AuthPageShell>
      <p className="mt-4 text-xl font-medium">Reset your password</p>
      <p className="mt-1 text-center text-sm text-muted-foreground">
        Enter your email and we&apos;ll send you a reset link.
      </p>

      {sent && (
        <Alert className="mt-6 mb-2">
          <AlertDescription>
            If an account exists for that email, a reset link has been sent.
          </AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive" className="mt-6 mb-2">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form className="mt-6 w-full space-y-4" onSubmit={handleSubmit}>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            className="w-full"
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </Field>
        <Button className="mt-4 w-full" type="submit" disabled={loading}>
          {loading ? "Sending…" : "Send reset link"}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm">
        <Link className="text-muted-foreground underline" href="/auth/login">
          Back to sign in
        </Link>
      </p>
    </AuthPageShell>
  )
}
