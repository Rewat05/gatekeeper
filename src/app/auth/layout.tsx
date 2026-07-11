export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Each auth page owns its own framing — signup is a full-bleed split
  // layout, login/verify-email are a centered card — so this just passes
  // children through.
  return <>{children}</>
}
