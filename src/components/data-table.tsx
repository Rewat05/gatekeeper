import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { PAGE_SIZE, type TableParams } from "@/lib/table-params"
import { DataTableSearch } from "@/components/data-table-search"

function buildHref(basePath: string, params: TableParams, prefix: string, page: number) {
  const search = new URLSearchParams()
  if (params.q) search.set(`${prefix}q`, params.q)
  if (params.sort) search.set(`${prefix}sort`, params.sort)
  if (params.order) search.set(`${prefix}order`, params.order)
  if (page > 1) search.set(`${prefix}page`, String(page))
  const qs = search.toString()
  return qs ? `${basePath}?${qs}` : basePath
}

export function DataTable({
  params,
  paramPrefix = "",
  totalCount,
  pageSize = PAGE_SIZE,
  basePath,
  searchPlaceholder,
  filters,
  isEmpty,
  emptyState,
  children,
}: {
  params: TableParams
  paramPrefix?: string
  totalCount: number
  pageSize?: number
  basePath: string
  searchPlaceholder?: string
  filters?: React.ReactNode
  isEmpty: boolean
  emptyState: React.ReactNode
  children: React.ReactNode
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const from = totalCount === 0 ? 0 : (params.page - 1) * pageSize + 1
  const to = Math.min(params.page * pageSize, totalCount)

  const showToolbar = Boolean(searchPlaceholder) || Boolean(filters)

  return (
    <div className="space-y-3">
      {showToolbar && (
        <div className="flex flex-wrap items-center gap-2">
          {searchPlaceholder && (
            <DataTableSearch paramPrefix={paramPrefix} placeholder={searchPlaceholder} />
          )}
          {filters}
        </div>
      )}

      {isEmpty ? (
        emptyState
      ) : (
        <>
          <div className="rounded-lg border overflow-hidden">{children}</div>

          <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
            <span>
              Showing {from}–{to} of {totalCount}
            </span>
            <div className="flex items-center gap-1">
              <Link
                href={buildHref(basePath, params, paramPrefix, params.page - 1)}
                aria-disabled={params.page <= 1}
                className={
                  params.page <= 1
                    ? "pointer-events-none opacity-40 flex items-center gap-1 px-2 py-1 rounded-md"
                    : "flex items-center gap-1 px-2 py-1 rounded-md hover:bg-muted transition-colors"
                }
              >
                <ChevronLeft className="size-3.5" />
                Previous
              </Link>
              <span className="px-2">
                Page {params.page} of {totalPages}
              </span>
              <Link
                href={buildHref(basePath, params, paramPrefix, params.page + 1)}
                aria-disabled={params.page >= totalPages}
                className={
                  params.page >= totalPages
                    ? "pointer-events-none opacity-40 flex items-center gap-1 px-2 py-1 rounded-md"
                    : "flex items-center gap-1 px-2 py-1 rounded-md hover:bg-muted transition-colors"
                }
              >
                Next
                <ChevronRight className="size-3.5" />
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
