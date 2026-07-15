"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useState } from "react"
import { resetPassword } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { PasswordInput } from "@/components/ui/password-input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AuthPageShell } from "@/components/auth-page-shell"

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  )
}

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get("token") ?? ""

  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (password !== confirmPassword) {
      setError("Passwords do not match.")
      return
    }

    setLoading(true)
    const { error } = await resetPassword({ newPassword: password, token })
    setLoading(false)

    if (error) {
      setError(error.message ?? "Failed to reset password. The link may have expired.")
      return
    }

    router.push("/auth/login")
  }

  if (!token) {
    return (
      <AuthPageShell>
        <p className="mt-4 text-xl font-medium">Invalid reset link</p>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          This password reset link is missing or invalid.
        </p>
        <p className="mt-5 text-center text-sm">
          <Link className="text-muted-foreground underline" href="/auth/forgot-password">
            Request a new link
          </Link>
        </p>
      </AuthPageShell>
    )
  }

  return (
    <AuthPageShell>
      <p className="mt-4 text-xl font-medium">Choose a new password</p>
      <p className="mt-1 text-center text-sm text-muted-foreground">
        Enter and confirm your new password.
      </p>

      {error && (
        <Alert variant="destructive" className="mt-6 mb-2">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form className="mt-6 w-full space-y-4" onSubmit={handleSubmit}>
        <Field>
          <FieldLabel htmlFor="password">New password</FieldLabel>
          <PasswordInput
            id="password"
            className="w-full"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="confirm-password">Confirm password</FieldLabel>
          <PasswordInput
            id="confirm-password"
            className="w-full"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
          />
        </Field>
        <Button className="mt-4 w-full" type="submit" disabled={loading}>
          {loading ? "Resetting…" : "Reset password"}
        </Button>
      </form>
    </AuthPageShell>
  )
}
