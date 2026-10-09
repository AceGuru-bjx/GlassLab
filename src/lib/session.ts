import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

/**
 * Session lookup that can never take a route handler down: a broken or
 * unconfigured auth setup (e.g. missing NEXTAUTH_SECRET in a bare smoke-test
 * environment) degrades to "guest", not a 500.
 */
export async function getSessionOrNull() {
  try {
    return await getServerSession(authOptions)
  } catch (error) {
    console.warn('[auth] session unavailable, treating as guest:', error)
    return null
  }
}

/**
 * Resolve the session user id for write attribution — but only if the user
 * still exists. A stale JWT cookie referencing a deleted account would
 * otherwise violate the userId FK on INSERT (P2003 → 500). In that case the
 * write degrades to a public/guest row instead of failing.
 */
export async function getSessionUserIdOrNull(): Promise<string | null> {
  try {
    const session = await getSessionOrNull()
    const id = session?.user?.id
    if (!id) return null
    const exists = await db.user.findUnique({
      where: { id },
      select: { id: true },
    })
    return exists ? id : null
  } catch (error) {
    console.warn('[auth] user id unavailable, treating as guest:', error)
    return null
  }
}
