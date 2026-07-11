import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { createSupabaseServiceClient } from "@/lib/supabase/server"
import { logAudit } from "@/lib/audit"

const schema = z.object({
  name: z.string().min(1).max(100),
  domain: z.string().nullable().optional(),
})

function generateOrgCode(name: string): string {
  const prefix = name
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 4)
    .padEnd(4, "X")
  const suffix = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `${prefix}-${suffix}`
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 })

  const { name, domain } = parsed.data
  const supabase = createSupabaseServiceClient()

  // One email/user may only belong to one organisation at a time.
  const { data: existingActive } = await supabase
    .from("org_members")
    .select("id")
    .eq("user_id", session.user.id)
    .eq("status", "Active")
    .maybeSingle()

  if (existingActive) {
    return NextResponse.json(
      { error: "You already belong to an organisation." },
      { status: 409 }
    )
  }

  // Generate a unique org code, retrying on the rare collision
  let org_code = ""
  for (let i = 0; i < 6; i++) {
    const candidate = generateOrgCode(name)
    const { data: clash } = await supabase
      .from("organizations")
      .select("id")
      .eq("org_code", candidate)
      .maybeSingle()
    if (!clash) { org_code = candidate; break }
  }
  if (!org_code) {
    return NextResponse.json({ error: "Could not generate a unique code. Try again." }, { status: 500 })
  }

  // Creating the org and enrolling the owner happen atomically in one
  // Postgres function call — either both succeed or neither does, so a
  // failed second step can never leave an orphaned organisation behind.
  const { data: orgId, error } = await supabase.rpc("create_org_with_owner", {
    p_name: name,
    p_domain: domain ?? null,
    p_org_code: org_code,
    p_owner_id: session.user.id,
  })

  if (error) {
    if (error.message?.includes("DOMAIN_TAKEN")) {
      return NextResponse.json(
        { error: "That domain is already registered to another organisation." },
        { status: 409 }
      )
    }
    if (error.message?.includes("ALREADY_MEMBER")) {
      return NextResponse.json(
        { error: "You already belong to an organisation." },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: "Failed to create organisation." }, { status: 500 })
  }

  await logAudit({
    orgId: orgId as string,
    actorId: session.user.id,
    action: "ORG_CREATED",
    targetType: "organization",
    targetId: orgId as string,
    metadata: { name, domain: domain ?? null },
  })

  return NextResponse.json({ org: { id: orgId } }, { status: 201 })
}
