import { ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"

export function Logo({ className }: { className?: string }) {
  return (
    <ShieldCheck className={cn("text-primary", className)} strokeWidth={2.25} />
  )
}
