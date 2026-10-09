'use client'

import { SessionProvider } from 'next-auth/react'

/** Client-side NextAuth session context for the whole app. */
export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>
}
