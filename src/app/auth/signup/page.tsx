"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import Link from "next/link"
import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { z } from "zod"
import { signUp } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AuthPageShell } from "@/components/auth-page-shell"

const formSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email(),
    password: z.string().min(8, "Password must be at least 8 characters long"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  })

export default function SignUp() {
  const [serverError, setServerError] = useState("")
  const [success, setSuccess] = useState(false)
  const [submittedEmail, setSubmittedEmail] = useState("")

  const form = useForm<z.infer<typeof formSchema>>({
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
    resolver: zodResolver(formSchema),
  })

  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    setServerError("")

    const { error } = await signUp.email({
      name: data.name,
      email: data.email,
      password: data.password,
      // Same reasoning as login: /dashboard redirects to /onboarding itself
      // when there's no membership yet, so clicking the verification link
      // lands somewhere useful instead of back on a page that just asks
      // for your email again.
      callbackURL: "/dashboard",
    })

    if (error) {
      setServerError(error.message ?? "Something went wrong. Please try again.")
      return
    }

    setSubmittedEmail(data.email)
    setSuccess(true)
  }

  return (
    <AuthPageShell>
      <p className="mt-4 text-xl font-medium">Create your Gatekeeper account</p>

      {success ? (
        <div className="mt-8 space-y-3 text-center">
          <p className="text-sm text-muted-foreground">
            We sent a verification link to{" "}
            <strong className="text-foreground">{submittedEmail}</strong>.
            Click it to activate your account.
          </p>
        </div>
      ) : (
        <>
          <p className="mt-1 text-center text-sm text-muted-foreground">
            Sign up with your email and password.
          </p>

          {serverError && (
            <Alert variant="destructive" className="mt-6 mb-2">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          <form
            className="mt-6 w-full space-y-4"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <Controller
              control={form.control}
              name="name"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Full name</FieldLabel>
                  <Input
                    aria-invalid={fieldState.invalid}
                    className="w-full"
                    placeholder="Full name"
                    autoComplete="name"
                    {...field}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="email"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Email</FieldLabel>
                  <Input
                    aria-invalid={fieldState.invalid}
                    className="w-full"
                    placeholder="Email"
                    type="email"
                    autoComplete="email"
                    {...field}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="password"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Password</FieldLabel>
                  <PasswordInput
                    aria-invalid={fieldState.invalid}
                    className="w-full"
                    placeholder="Password"
                    autoComplete="new-password"
                    {...field}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="confirmPassword"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Confirm password</FieldLabel>
                  <PasswordInput
                    aria-invalid={fieldState.invalid}
                    className="w-full"
                    placeholder="Confirm password"
                    autoComplete="new-password"
                    {...field}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Button
              className="mt-4 w-full"
              type="submit"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting
                ? "Creating account…"
                : "Create account"}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm">
            Already have an account?
            <Link className="ml-1 text-muted-foreground underline" href="/auth/login">
              Log in
            </Link>
          </p>
        </>
      )}
    </AuthPageShell>
  )
}
