import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { createSupabaseServiceClient } from "@/lib/supabase/server"
import { logAudit } from "@/lib/audit"

const schema = z.object({
  name: z.string().min(1).max(100).optional(),
  domain: z.string().nullable().optional(),
})

export async function PATCH(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 })

  const supabase = createSupabaseServiceClient()

  const { data: caller } = await supabase
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", session.user.id)
    .eq("status", "Active")
    .maybeSingle()

  if (!caller || (caller.role as string) !== "Owner") {
    return NextResponse.json({ error: "Only Owners can update organisation settings." }, { status: 403 })
  }

  const update: Record<string, unknown> = {}
  if (parsed.data.name !== undefined) update.name = parsed.data.name
  if (parsed.data.domain !== undefined) update.domain = parsed.data.domain

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 })
  }

  const { error } = await supabase
    .from("organizations")
    .update(update)
    .eq("id", caller.org_id)

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "That domain is already registered to another organisation." },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: "Update failed." }, { status: 500 })
  }

  await logAudit({
    orgId: caller.org_id as string,
    actorId: session.user.id,
    action: "ORG_UPDATED",
    targetType: "organization",
    targetId: caller.org_id as string,
    metadata: { changes: Object.keys(update) },
  })

  return NextResponse.json({ ok: true })
}
