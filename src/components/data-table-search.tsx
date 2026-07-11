"use client"

import { useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { SearchIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { useTableUrlParam } from "@/lib/use-table-url-param"

export function DataTableSearch({
  paramPrefix = "",
  placeholder,
}: {
  paramPrefix?: string
  placeholder?: string
}) {
  const searchParams = useSearchParams()
  const updateParams = useTableUrlParam()
  const [value, setValue] = useState(() => searchParams.get(`${paramPrefix}q`) ?? "")
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value
    setValue(next)

    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      updateParams({ [`${paramPrefix}q`]: next, [`${paramPrefix}page`]: "" })
    }, 300)
  }

  return (
    <div className="relative w-full max-w-xs">
      <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
      <Input
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        className="pl-8 h-8 text-sm"
      />
    </div>
  )
}
