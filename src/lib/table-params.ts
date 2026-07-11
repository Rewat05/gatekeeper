import type { SupabaseClient } from "@supabase/supabase-js"

export const PAGE_SIZE = 10

export type TableParams = {
  q: string
  page: number
  sort: string
  order: "asc" | "desc"
}

type RawSearchParams = { [key: string]: string | string[] | undefined }

function readParam(searchParams: RawSearchParams, key: string): string {
  const value = searchParams[key]
  return typeof value === "string" ? value : ""
}

export function parseTableParams(
  searchParams: RawSearchParams,
  opts: { prefix?: string; defaultSort: string; defaultOrder?: "asc" | "desc" }
): TableParams {
  const prefix = opts.prefix ?? ""

  const rawPage = Number(readParam(searchParams, `${prefix}page`))
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1

  const rawOrder = readParam(searchParams, `${prefix}order`)
  const order = rawOrder === "asc" || rawOrder === "desc" ? rawOrder : opts.defaultOrder ?? "asc"

  const sort = readParam(searchParams, `${prefix}sort`) || opts.defaultSort
  const q = readParam(searchParams, `${prefix}q`)

  return { q, page, sort, order }
}

/** Escapes Postgrest ilike wildcard/escape characters before interpolating user text. */
export function escapeIlike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")
}

export function getRange(page: number, pageSize: number = PAGE_SIZE): [number, number] {
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  return [from, to]
}

/**
 * Two-step search helper: looks up ids in `table` whose `columns` match `q` (ilike, escaped),
 * unioned across columns. Callers must check the result before running their main query —
 * an empty array means "no matches," and the main query should be skipped entirely rather
 * than calling `.in(idColumn, [])`.
 */
export async function lookupIdsByText(
  supabase: SupabaseClient,
  table: string,
  columns: string[],
  idColumn: string,
  q: string
): Promise<string[]> {
  const escaped = escapeIlike(q)
  const ids = new Set<string>()

  for (const column of columns) {
    const { data } = await supabase
      .from(table)
      .select(idColumn)
      .ilike(column, `%${escaped}%`)

    for (const row of (data ?? []) as unknown as Record<string, string>[]) {
      ids.add(row[idColumn])
    }
  }

  return [...ids]
}
