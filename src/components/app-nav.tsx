"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Users,
  Building2,
  Database,
  ClipboardList,
  ScrollText,
  Settings,
  UserPlus,
  IdCard,
  ShieldCheck,
} from "lucide-react"
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar"

type Role = "Owner" | "Admin" | "Manager" | "Member" | "Viewer"

const NAV_ITEMS = [
  { href: "/dashboard",        label: "Dashboard",        icon: LayoutDashboard, roles: null },
  { href: "/members",          label: "Members",          icon: Users,           roles: ["Owner", "Admin", "Manager"] as Role[] },
  { href: "/departments",      label: "Departments",      icon: Building2,       roles: ["Owner", "Admin"] as Role[] },
  { href: "/access-profiles",  label: "Access Profiles",  icon: IdCard,          roles: ["Owner", "Admin"] as Role[] },
  { href: "/file-stores",      label: "File Stores",      icon: Database,        roles: null },
  { href: "/access-requests",  label: "Access Requests",  icon: ClipboardList,   roles: null },
  { href: "/access-reviews",   label: "Access Reviews",   icon: ShieldCheck,     roles: null },
  { href: "/join-requests",    label: "Join Requests",    icon: UserPlus,        roles: ["Owner", "Admin"] as Role[] },
  { href: "/audit",            label: "Audit Log",        icon: ScrollText,      roles: ["Owner", "Admin"] as Role[] },
  { href: "/settings",         label: "Settings",         icon: Settings,        roles: ["Owner"] as Role[] },
]

export function AppNav({ role }: { role: string }) {
  const pathname = usePathname()

  const visible = NAV_ITEMS.filter(
    (item) => item.roles === null || item.roles.includes(role as Role)
  )

  return (
    <SidebarMenu>
      {visible.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href || pathname.startsWith(href + "/")
        return (
          <SidebarMenuItem key={href}>
            <SidebarMenuButton asChild isActive={isActive}>
              <Link href={href}>
                <Icon />
                <span>{label}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )
      })}
    </SidebarMenu>
  )
}
