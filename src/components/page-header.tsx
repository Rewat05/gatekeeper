import { cn } from "@/lib/utils"

interface PageHeaderProps {
  title: React.ReactNode
  description?: React.ReactNode
  meta?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}

export function PageHeader({ title, description, meta, actions, className }: PageHeaderProps) {
  const heading = <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>

  const titleBlock = (
    <div>
      {!description && !meta ? (
        heading
      ) : (
        <div className={meta ? "flex items-baseline gap-3" : undefined}>
          {heading}
          {meta}
          {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
        </div>
      )}
      <span aria-hidden="true" className="mt-2 block h-0.5 w-8 rounded-full bg-accent" />
    </div>
  )

  if (!actions) {
    return className ? <div className={className}>{titleBlock}</div> : titleBlock
  }

  return (
    <div className={cn("flex items-center justify-between", className)}>
      {titleBlock}
      {actions}
    </div>
  )
}
