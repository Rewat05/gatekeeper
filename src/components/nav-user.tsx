"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { LogOut, KeyRound } from "lucide-react"
import { signOut, requestPasswordReset } from "@/lib/auth-client"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"

export function NavUser({
  displayName,
  initials,
  role,
  email,
}: {
  displayName: string
  initials: string
  role: string
  email: string
}) {
  const router = useRouter()
  const [sendingReset, setSendingReset] = useState(false)

  async function handleSignOut() {
    await signOut()
    router.push("/auth/login")
  }

  async function handleResetPassword() {
    if (sendingReset) return
    setSendingReset(true)
    const { error } = await requestPasswordReset({ email, redirectTo: "/auth/reset-password" })
    setSendingReset(false)
    alert(error ? (error.message ?? "Failed to send reset link.") : "Password reset link sent to your email.")
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="size-7 rounded-full bg-accent/15 flex items-center justify-center text-[11px] font-bold text-accent shrink-0">
                {initials}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-xs font-medium truncate leading-tight text-primary-foreground">
                  {displayName}
                </p>
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5 mt-0.5">
                  {role}
                </Badge>
              </div>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
            sideOffset={4}
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
          >
            <DropdownMenuItem onClick={handleResetPassword} disabled={sendingReset}>
              <KeyRound />
              {sendingReset ? "Sending…" : "Reset password"}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
