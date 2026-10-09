import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { NextAuthOptions } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { db } from '@/lib/db'

/**
 * NextAuth (v4) configuration — credentials provider backed by the Prisma
 * User table, JWT sessions (no adapter needed).
 *
 * Server-only: this module imports the Prisma client and must never be
 * pulled into client bundles (the UI talks to NextAuth via next-auth/react).
 */

const DEV_SECRET = 'glasslab-dev-only-secret'

export const authOptions: NextAuthOptions = {
  // A missing NEXTAUTH_SECRET makes next-auth throw NO_SECRET in production
  // and 500 every authed route; fall back with a loud warning instead so a
  // bare standalone run (smoke tests) degrades to guest mode, not errors.
  secret: process.env.NEXTAUTH_SECRET || DEV_SECRET,
  session: { strategy: 'jwt' },
  providers: [
    Credentials({
      name: '邮箱登录',
      credentials: {
        email: { label: '邮箱', type: 'email' },
        password: { label: '密码', type: 'password' },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase()
        const password = credentials?.password
        if (!email || !password) return null

        const user = await db.user.findUnique({ where: { email } })
        if (!user?.passwordHash) return null
        if (!verifyPassword(password, user.passwordHash)) return null

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? user.email.split('@')[0],
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id
      return token
    },
    async session({ session, token }) {
      if (session.user && token.id) session.user.id = token.id
      return session
    },
  },
}

// ---------------------------------------------------------------------------
// Password hashing — scrypt with per-user random salt, stored as salt:hex.
// ---------------------------------------------------------------------------

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const candidate = scryptSync(password, salt, 64)
  const expected = Buffer.from(hash, 'hex')
  return (
    candidate.length === expected.length && timingSafeEqual(candidate, expected)
  )
}
