import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'

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
