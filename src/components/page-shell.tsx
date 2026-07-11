import { cn } from "@/lib/utils"

type MaxWidth = "lg" | "2xl" | "4xl" | "5xl" | "6xl"

const maxWidthClass: Record<MaxWidth, string> = {
  lg: "max-w-lg",
  "2xl": "max-w-2xl",
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
  "6xl": "max-w-6xl",
}

export function PageShell({
  children,
  maxWidth = "5xl",
  spacing = "space-y-6",
  className,
}: {
  children: React.ReactNode
  maxWidth?: MaxWidth
  spacing?: string
  className?: string
}) {
  return (
    <div className={cn("p-8 mx-auto", maxWidthClass[maxWidth], spacing, className)}>
      {children}
    </div>
  )
}
