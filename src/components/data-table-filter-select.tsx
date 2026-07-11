"use client"

import { useTableUrlParam } from "@/lib/use-table-url-param"

export function DataTableFilterSelect({
  paramKey,
  pageParamKey,
  value,
  options,
  placeholder,
}: {
  paramKey: string
  pageParamKey: string
  value: string
  options: { value: string; label: string }[]
  placeholder: string
}) {
  const updateParams = useTableUrlParam()

  return (
    <select
      value={value}
      onChange={(e) => updateParams({ [paramKey]: e.target.value, [pageParamKey]: "" })}
      className="flex h-8 rounded-md border border-input bg-background px-2.5 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
    >
      <option value="">{placeholder}</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}
