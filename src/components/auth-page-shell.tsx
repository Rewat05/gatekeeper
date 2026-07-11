import { cn } from "@/lib/utils"
import { Logo } from "@/components/logo"
import { AuthSidePanel } from "@/components/auth-side-panel"

export function AuthPageShell({
  children,
  className,
}: {
  children: React.ReactNode
  /** Override the inner column's max-width (defaults to max-w-xs). */
  className?: string
}) {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="grid h-full w-full p-4 lg:grid-cols-2">
        <div className={cn("m-auto flex w-full max-w-xs flex-col items-center", className)}>
          <Logo className="h-9 w-9" />
          {children}
        </div>

        <AuthSidePanel />
      </div>
    </div>
  )
}
