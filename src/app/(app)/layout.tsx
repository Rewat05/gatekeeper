import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { createSupabaseServiceClient } from "@/lib/supabase/server"
import { AppNav } from "@/components/app-nav"
import { NavUser } from "@/components/nav-user"
import { ThemeDropdown } from "@/components/theme-dropdown"
import { ColorThemeDropdown } from "@/components/color-theme-dropdown"
import { AboutPageDialog } from "@/components/about-page-dialog"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/auth/login")

  const supabase = createSupabaseServiceClient()
  const { data: membership } = await supabase
    .from("org_members")
    .select("role, org_id, organizations(name)")
    .eq("user_id", session.user.id)
    .eq("status", "Active")
    .maybeSingle()

  if (!membership) redirect("/onboarding")

  const org = membership.organizations as { name: string } | null
  const displayName = session.user.name ?? session.user.email
  const initials = displayName
    .split(" ")
    .map((w: string) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="px-4 py-2.75 gap-0.5 border-b border-sidebar-border">
          <p className="text-[10px] text-accent uppercase tracking-widest font-semibold leading-none">
            Gatekeeper
          </p>
          <p className="text-[10px] font-semibold truncate leading-none text-primary-foreground">
            {org?.name ?? "Your Organisation"}
          </p>
        </SidebarHeader>

        <SidebarContent className="py-3 px-2">
          <AppNav role={membership.role as string} />
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border px-3 py-1.5">
          <NavUser
            displayName={displayName}
            initials={initials}
            role={membership.role as string}
            email={session.user.email}
          />
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
          <SidebarTrigger className="md:hidden" />
          <div className="flex items-center gap-1 ml-auto">
            <ColorThemeDropdown />
            <ThemeDropdown />
            <AboutPageDialog />
          </div>
        </div>
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}
