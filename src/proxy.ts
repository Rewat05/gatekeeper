import { NextRequest, NextResponse } from "next/server"
import { betterFetch } from "@better-fetch/fetch"
import type { Session } from "@/lib/auth"

// All public pages live under /auth/* (plus the bare root), so this prefix
// check is safe — unlike the old flat list, nothing else in the app starts
// with "/auth/", so new public pages added under it need no changes here.
const AUTH_ONLY_PAGES = new Set(["/auth/login", "/auth/signup"])

function isPublicPage(pathname: string) {
  return pathname === "/" || pathname === "/auth" || pathname.startsWith("/auth/")
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isApiPath = pathname.startsWith("/api/")
  const isPublicApi = pathname === "/api/auth" || pathname.startsWith("/api/auth/")

  // Always allow Better Auth's own API routes through
  if (isPublicApi) return NextResponse.next()

  // Use betterFetch instead of importing auth directly — auth uses pg/kysely
  // which require Node.js native modules not available in the Edge runtime.
  const { data: session } = await betterFetch<Session>("/api/auth/get-session", {
    baseURL: request.nextUrl.origin,
    headers: { cookie: request.headers.get("cookie") ?? "" },
  })

  if (!session) {
    // API routes each enforce their own auth too, but this is a backstop:
    // a route that forgets its own check still fails closed here instead
    // of silently passing through.
    if (isApiPath) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (isPublicPage(pathname)) return NextResponse.next()
    return NextResponse.redirect(new URL("/auth/login", request.url))
  }

  // Beyond "is someone logged in," API routes enforce their own role/org
  // checks — no page-style redirects for them.
  if (isApiPath) return NextResponse.next()

  // Has session but email not verified → gate everything except verify-email
  if (!session.user.emailVerified) {
    if (pathname === "/auth/verify-email") return NextResponse.next()
    return NextResponse.redirect(new URL("/auth/verify-email", request.url))
  }

  // Verified user trying to access login/signup → push to onboarding
  if (AUTH_ONLY_PAGES.has(pathname)) {
    return NextResponse.redirect(new URL("/onboarding", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
