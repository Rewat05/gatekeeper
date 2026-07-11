"use client"

import { useEffect, useState } from "react"
import { UserPlus, ClipboardList } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

const POLL_INTERVAL_MS = 15000

// These two counts change from OTHER people's actions (someone else
// submitting a join/access request), so unlike the rest of the dashboard —
// which only needs to be fresh when this user navigates here — these poll
// on their own so an already-open dashboard doesn't sit showing a stale 0.
export function PendingRequestCards({
  initialJoinCount,
  initialAccessCount,
}: {
  initialJoinCount: number
  initialAccessCount: number
}) {
  const [joinCount, setJoinCount] = useState(initialJoinCount)
  const [accessCount, setAccessCount] = useState(initialAccessCount)

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch("/api/dashboard/pending-counts")
        if (!res.ok) return
        const data = await res.json()
        setJoinCount(data.pendingJoinCount ?? 0)
        setAccessCount(data.pendingAccessCount ?? 0)
      } catch {
        // Network hiccup — keep the last known counts, retry next tick.
      }
    }

    const interval = setInterval(poll, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  const cards = [
    { title: "Pending Join Requests", value: joinCount, icon: UserPlus },
    { title: "Pending Access Requests", value: accessCount, icon: ClipboardList },
  ]

  return (
    <>
      {cards.map((stat) => {
        const alert = stat.value > 0
        return (
          <Card key={stat.title}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{stat.title}</p>
                  <p className="text-2xl font-semibold mt-1">{stat.value}</p>
                </div>
                <div className={cn("p-2 rounded-md", alert ? "bg-destructive/10" : "bg-muted")}>
                  <stat.icon
                    className={cn("size-4", alert ? "text-destructive" : "text-muted-foreground")}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </>
  )
}
