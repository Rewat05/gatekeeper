"use client"

import { Suspense, useState } from "react"
import { useSearchParams } from "next/navigation"
import { sendVerificationEmail } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AuthPageShell } from "@/components/auth-page-shell"

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailForm />
    </Suspense>
  )
}

function VerifyEmailForm() {
  const searchParams = useSearchParams()
  const defaultEmail = searchParams.get("email") ?? ""

  const [email, setEmail] = useState(defaultEmail)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleResend(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    const { error } = await sendVerificationEmail({
      email,
      // Same reasoning as login: let /dashboard decide whether onboarding
      // is actually needed instead of forcing it unconditionally.
      callbackURL: "/dashboard",
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
      <p className="mt-4 text-xl font-medium">Verify your email</p>
      <p className="mt-1 text-center text-sm text-muted-foreground">
        Check your inbox for a verification link. You must verify your email
        before continuing.
      </p>

      {sent && (
        <Alert className="mt-6 mb-2">
          <AlertDescription>
            Verification email sent. Check your inbox.
          </AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive" className="mt-6 mb-2">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form className="mt-6 w-full space-y-4" onSubmit={handleResend}>
        <Field>
          <FieldLabel htmlFor="email">Email address</FieldLabel>
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
        <Button
          className="mt-4 w-full"
          type="submit"
          variant="outline"
          disabled={loading}
        >
          {loading ? "Sending…" : "Resend verification email"}
        </Button>
      </form>
    </AuthPageShell>
  )
}
