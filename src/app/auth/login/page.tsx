"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { signIn } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AuthPageShell } from "@/components/auth-page-shell"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    const { error } = await signIn.email({
      email,
      password,
      // /dashboard redirects to /onboarding itself when there's no active
      // membership, so this lands returning members straight on the
      // dashboard instead of forcing everyone through the org chooser.
      callbackURL: "/dashboard",
    })

    setLoading(false)

    if (error) {
      // Better Auth returns EMAIL_NOT_VERIFIED when requireEmailVerification is on
      if (error.status === 403) {
        router.push("/auth/verify-email?email=" + encodeURIComponent(email))
        return
      }
      setError("Invalid email or password.")
    }
  }

  return (
    <AuthPageShell>
      <p className="mt-4 text-xl font-medium">Welcome back</p>
      <p className="mt-1 text-center text-sm text-muted-foreground">
        Sign in with your email and password.
      </p>

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
        <Field>
          <div className="flex items-center justify-between">
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Link
              href="/auth/forgot-password"
              className="text-xs text-muted-foreground underline"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            className="w-full"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>
        <Button className="mt-4 w-full" type="submit" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm">
        Don&apos;t have an account?
        <Link className="ml-1 text-muted-foreground underline" href="/auth/signup">
          Sign up
        </Link>
      </p>
    </AuthPageShell>
  )
}
