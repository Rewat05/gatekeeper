import { betterAuth } from "better-auth"
import { nextCookies } from "better-auth/next-js"
import { Pool } from "pg"
import { PostgresDialect } from "kysely"
import nodemailer from "nodemailer"

// Sends through the sender's own Gmail account (SMTP + an App Password) —
// gmail.com is already a verified sending domain, so this works without
// owning or verifying any domain, and can deliver to any recipient.
const mailer = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
  // Serverless functions get killed at their execution limit; without these,
  // a stalled SMTP handshake hangs silently instead of failing with a log.
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 10_000,
})

async function sendMail(options: Parameters<typeof mailer.sendMail>[0]) {
  try {
    const info = await mailer.sendMail(options)
    console.log("[mailer] sent:", { to: options.to, messageId: info.messageId, response: info.response })
  } catch (err) {
    console.error("[mailer] failed:", { to: options.to }, err)
    throw err
  }
}

export const auth = betterAuth({
  database: new PostgresDialect({
    pool: new Pool({ connectionString: process.env.DATABASE_URL }),
  }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await sendMail({
        from: `Gatekeeper <${process.env.GMAIL_USER}>`,
        to: user.email,
        subject: "Reset your Gatekeeper password",
        html: `
          <p>Hi ${user.name || user.email},</p>
          <p>Click the link below to reset your password:</p>
          <a href="${url}">${url}</a>
          <p>If you didn't request this, you can safely ignore this email. This link expires in 1 hour.</p>
        `,
      })
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendMail({
        from: `Gatekeeper <${process.env.GMAIL_USER}>`,
        to: user.email,
        subject: "Verify your Gatekeeper account",
        html: `
          <p>Hi ${user.name || user.email},</p>
          <p>Click the link below to verify your email address:</p>
          <a href="${url}">${url}</a>
          <p>This link expires in 24 hours.</p>
        `,
      })
    },
  },

  plugins: [nextCookies()],

  trustedOrigins: [process.env.BETTER_AUTH_URL!],
})

export type Session = typeof auth.$Infer.Session
export type User = typeof auth.$Infer.Session.user
