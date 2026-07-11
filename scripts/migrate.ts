import { auth } from "../src/lib/auth"

async function migrate() {
  console.log("Running Better Auth migrations…")
  const ctx = await auth.$context
  await ctx.runMigrations()
  console.log("Done — Better Auth tables created in Supabase.")
  process.exit(0)
}

migrate().catch((err) => {
  console.error("Migration failed:", err)
  process.exit(1)
})
