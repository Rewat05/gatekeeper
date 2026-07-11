"use client"

import { usePathname } from "next/navigation"
import { Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

const PAGE_INFO: { match: string; title: string; description: string }[] = [
  {
    match: "/dashboard",
    title: "Dashboard",
    description:
      "A quick overview of your organisation: how many active members and departments you have, your own active access grants and pending requests, and — if you're an Owner or Admin — how many join and access requests are waiting for review.",
  },
  {
    match: "/members",
    title: "Members",
    description:
      "Everyone who belongs to your organisation, along with their role, department, and status. Owners and Admins can change a member's role or department, or suspend/reactivate their access; Managers can view the list but not make changes.",
  },
  {
    match: "/departments",
    title: "Departments",
    description:
      "Departments group your members together and control who can see Internal-classified file stores. Each department can optionally have a manager. Owners and Admins can create, edit, and delete departments.",
  },
  {
    match: "/file-stores",
    title: "File Stores",
    description:
      "File stores are the resource containers this platform governs access to. Each one has a sensitivity classification and can be scoped to a department. From here you can browse existing stores, request access to one, or — as an Owner/Admin — create a new one and manage who has access.",
  },
  {
    match: "/access-requests",
    title: "Access Requests",
    description:
      "Track requests for file store access. If you're an Owner, Admin, or Manager, you'll see a queue of pending requests to approve or deny. Everyone can see the requests they've personally submitted and their current status here too.",
  },
  {
    match: "/join-requests",
    title: "Join Requests",
    description:
      "People who enter your organisation's code while signing up show up here as a pending join request. Owners and Admins can approve them (adding them as a Member) or deny the request.",
  },
  {
    match: "/audit",
    title: "Audit Log",
    description:
      "A chronological, read-only record of every significant action taken in your organisation — members added or changed, departments and file stores created or edited, access granted or revoked. Useful for accountability and tracing what happened and when.",
  },
  {
    match: "/settings",
    title: "Settings",
    description:
      "Owner-only organisation settings: your organisation's name, its email domain (used for automatic-join matching), and your shareable organisation code for inviting new members.",
  },
]

const DEFAULT_INFO = {
  title: "Gatekeeper",
  description:
    "Gatekeeper is an enterprise access governance platform — it helps you manage who belongs to your organisation, what they can access, and keeps a record of it all.",
}

export function AboutPageDialog() {
  const pathname = usePathname()
  const info = PAGE_INFO.find((p) => pathname.startsWith(p.match)) ?? DEFAULT_INFO

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm">
          <Info />
          <span className="sr-only">About this page</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{info.title}</DialogTitle>
          <DialogDescription>{info.description}</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  )
}
