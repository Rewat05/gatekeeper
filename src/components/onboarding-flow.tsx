"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { AuthPageShell } from "@/components/auth-page-shell"

type Flow = "choose" | "create" | "join"
type JoinStep = "enter-code" | "domain-match" | "pending"

export function OnboardingFlow({
  initialPendingOrgName,
}: {
  /** Set when the server already found an active Pending join_requests row
   *  for this user, so a page reload lands back on "pending" instead of
   *  resetting to the chooser and hiding a request that's already in. */
  initialPendingOrgName?: string | null
}) {
  const router = useRouter()
  const { data: session } = useSession()

  const [flow, setFlow] = useState<Flow>(initialPendingOrgName ? "join" : "choose")
  const [joinStep, setJoinStep] = useState<JoinStep>(
    initialPendingOrgName ? "pending" : "enter-code"
  )
  const [pendingOrgName, setPendingOrgName] = useState<string | null>(
    initialPendingOrgName ?? null
  )
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  // Create org state
  const [orgName, setOrgName] = useState("")
  const [orgDomain, setOrgDomain] = useState("")

  // Join state
  const [orgCode, setOrgCode] = useState("")
  const [joinReason, setJoinReason] = useState("")
  const [matchedOrg, setMatchedOrg] = useState<{ name: string; id: string } | null>(null)

  async function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    const res = await fetch("/api/orgs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: orgName, domain: orgDomain || null }),
    })

    setLoading(false)

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? "Failed to create organisation.")
      return
    }

    router.push("/dashboard")
  }

  async function handleCheckDomain() {
    const emailDomain = session?.user.email.split("@")[1]
    if (!emailDomain) return

    setLoading(true)
    const res = await fetch(`/api/orgs/by-domain?domain=${emailDomain}`)
    setLoading(false)

    if (res.ok) {
      const data = await res.json()
      setMatchedOrg(data.org)
      setJoinStep("domain-match")
    } else {
      setJoinStep("enter-code")
    }
  }

  async function handleDomainJoin() {
    if (!matchedOrg) return
    setLoading(true)

    const res = await fetch("/api/orgs/join/domain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId: matchedOrg.id }),
    })

    setLoading(false)

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? "Failed to join.")
      return
    }

    router.push("/dashboard")
  }

  async function handleCodeJoin(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    const res = await fetch("/api/orgs/join/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgCode, reason: joinReason }),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error ?? "Invalid org code.")
      return
    }

    setPendingOrgName(data.orgName ?? null)
    setJoinStep("pending")
  }

  // ── Flow: Choose ──────────────────────────────────────────────────────────

  if (flow === "choose") {
    return (
      <AuthPageShell className="max-w-sm">
        <p className="mt-4 text-xl font-medium">Get started with Gatekeeper</p>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          Create a new organisation or join an existing one.
        </p>

        <div className="mt-6 grid w-full gap-3">
          <Card
            className="cursor-pointer transition-colors hover:border-foreground/30"
            onClick={() => setFlow("create")}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Create organisation</CardTitle>
                <Badge variant="secondary">Owner</Badge>
              </div>
              <CardDescription>
                Set up a new organisation, define departments, and invite your team.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card
            className="cursor-pointer transition-colors hover:border-foreground/30"
            onClick={() => { setFlow("join"); handleCheckDomain() }}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Join organisation</CardTitle>
                <Badge variant="outline">Member</Badge>
              </div>
              <CardDescription>
                Join via your work email domain or with an organisation code.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </AuthPageShell>
    )
  }

  // ── Flow: Create org ──────────────────────────────────────────────────────

  if (flow === "create") {
    return (
      <AuthPageShell className="max-w-sm">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 mb-1 w-fit self-start"
          onClick={() => setFlow("choose")}
        >
          ← Back
        </Button>
        <p className="text-xl font-medium">Create your organisation</p>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          You&apos;ll become the Owner and can set up departments and resources.
        </p>

        {error && (
          <Alert variant="destructive" className="mt-6 mb-2">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleCreateOrg} className="mt-6 w-full space-y-4">
          <div className="space-y-2">
            <Label htmlFor="orgName">Organisation name</Label>
            <Input
              id="orgName"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Acme Corp"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="orgDomain">
              Trusted email domain{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="orgDomain"
              value={orgDomain}
              onChange={(e) => setOrgDomain(e.target.value)}
              placeholder="acme.com"
            />
            <p className="text-xs text-muted-foreground">
              Anyone with a verified @acme.com email can auto-join as Viewer.
            </p>
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating…" : "Create organisation"}
          </Button>
        </form>
      </AuthPageShell>
    )
  }

  // ── Flow: Join → Domain match ─────────────────────────────────────────────

  if (flow === "join" && joinStep === "domain-match" && matchedOrg) {
    return (
      <AuthPageShell className="max-w-sm">
        <p className="text-xl font-medium">We found your organisation</p>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          Your email domain matches{" "}
          <strong className="text-foreground">{matchedOrg.name}</strong>. Join
          instantly as a Viewer.
        </p>

        {error && (
          <Alert variant="destructive" className="mt-6 mb-2">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="mt-6 w-full space-y-3">
          <Button className="w-full" onClick={handleDomainJoin} disabled={loading}>
            {loading ? "Joining…" : `Join ${matchedOrg.name}`}
          </Button>
          <Separator />
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => setJoinStep("enter-code")}
          >
            Use an org code instead
          </Button>
        </div>
      </AuthPageShell>
    )
  }

  // ── Flow: Join → Enter org code ───────────────────────────────────────────

  if (flow === "join" && joinStep === "enter-code") {
    return (
      <AuthPageShell className="max-w-sm">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 mb-1 w-fit self-start"
          onClick={() => setFlow("choose")}
        >
          ← Back
        </Button>
        <p className="text-xl font-medium">Join with org code</p>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          Enter the organisation code shared by your admin. Your request will
          be reviewed before you&apos;re added.
        </p>

        {error && (
          <Alert variant="destructive" className="mt-6 mb-2">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleCodeJoin} className="mt-6 w-full space-y-4">
          <div className="space-y-2">
            <Label htmlFor="orgCode">Organisation code</Label>
            <Input
              id="orgCode"
              value={orgCode}
              onChange={(e) => setOrgCode(e.target.value.toUpperCase())}
              placeholder="ACME-XXXX"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="joinReason">
              Why do you want to join?{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="joinReason"
              value={joinReason}
              onChange={(e) => setJoinReason(e.target.value)}
              placeholder="I'm a contractor working with the Finance team"
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Sending request…" : "Request to join"}
          </Button>
        </form>
      </AuthPageShell>
    )
  }

  // ── Flow: Join → Request pending ─────────────────────────────────────────

  if (joinStep === "pending") {
    return (
      <AuthPageShell className="max-w-sm">
        <p className="text-xl font-medium">Request sent</p>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          Your request to join{" "}
          {pendingOrgName ? (
            <strong className="text-foreground">{pendingOrgName}</strong>
          ) : (
            "the organisation"
          )}{" "}
          has been sent to the admins. You&apos;ll receive an email once it&apos;s
          reviewed.
        </p>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          You can close this page. We&apos;ll email you when your access is
          granted.
        </p>
      </AuthPageShell>
    )
  }

  return null
}
