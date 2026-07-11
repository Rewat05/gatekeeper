import { Playfair_Display } from "next/font/google"
import { Building2, ClipboardCheck, KeyRound } from "lucide-react"
import DotGrid from "@/components/dot-grid"
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card"

const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  weight: ["800", "900"],
})

const FEATURES = [
  {
    icon: Building2,
    title: "Role-based access",
    description: "Owner, Admin, Manager, and Member roles scoped to departments.",
  },
  {
    icon: KeyRound,
    title: "Governed file stores",
    description: "Classify file stores by sensitivity and grant access with an expiry.",
  },
  {
    icon: ClipboardCheck,
    title: "Request & approve",
    description: "A clear, traceable workflow for every access request.",
  },
]

export function AuthSidePanel() {
  return (
    <div className="relative hidden overflow-hidden rounded-lg border bg-primary lg:block">
      <div className="absolute inset-0">
        <DotGrid
          dotSize={4}
          gap={22}
          baseColor="#5b5f66"
          activeColor="#e0a545"
          proximity={100}
          shockRadius={180}
          shockStrength={3}
          resistance={700}
          returnDuration={1.2}
        />
      </div>

      <div className="relative flex h-full flex-col justify-center gap-8 overflow-y-auto p-10 text-primary-foreground">
        <div>
          <p className="text-xs font-bold tracking-[0.18em] text-accent uppercase">
            Enterprise Access Governance
          </p>

          <p
            lang="en"
            className={`${playfairDisplay.className} mt-3 text-[2.5rem] leading-[1.08] font-black tracking-tight [hyphens:auto]`}
          >
            Welcome to
            <br />
            <span className="inline-block text-[4rem] text-accent">Gatekeeper</span>
            <br />
            Access Governance
          </p>

          <span className="mt-5 block h-1 w-14 rounded-full bg-accent" />
        </div>

        <div className="space-y-3">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <Card key={title} data-size="sm" className="border-none shadow-none">
              <CardContent className="flex items-start gap-3.5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
                  <Icon className="size-4.5" strokeWidth={2} />
                </div>
                <div className="space-y-0.5">
                  <CardTitle>{title}</CardTitle>
                  <CardDescription>{description}</CardDescription>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
