import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServiceClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  const domain = request.nextUrl.searchParams.get("domain")
  if (!domain) return NextResponse.json({ error: "Missing domain" }, { status: 400 })

  const supabase = createSupabaseServiceClient()
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("domain", domain)
    .maybeSingle()

  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({ org })
}
