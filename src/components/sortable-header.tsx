import Link from "next/link"
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import type { TableParams } from "@/lib/table-params"

export function SortableHeader({
  label,
  sortKey,
  params,
  paramPrefix = "",
  basePath,
  className,
}: {
  label: string
  sortKey: string
  params: TableParams
  paramPrefix?: string
  basePath: string
  className?: string
}) {
  const isActive = params.sort === sortKey
  const nextOrder = isActive && params.order === "asc" ? "desc" : "asc"

  const search = new URLSearchParams()
  if (params.q) search.set(`${paramPrefix}q`, params.q)
  search.set(`${paramPrefix}sort`, sortKey)
  search.set(`${paramPrefix}order`, nextOrder)
  const href = `${basePath}?${search.toString()}`

  const Icon = !isActive ? ArrowUpDown : params.order === "asc" ? ArrowUp : ArrowDown

  return (
    <th className={cn("text-left px-4 py-3 text-xs font-medium text-muted-foreground", className)}>
      <Link
        href={href}
        className={cn(
          "inline-flex items-center gap-1 transition-colors",
          isActive ? "text-accent" : "hover:text-foreground"
        )}
      >
        {label}
        <Icon className={cn("size-3", isActive ? "opacity-100" : "opacity-40")} />
      </Link>
    </th>
  )
}
