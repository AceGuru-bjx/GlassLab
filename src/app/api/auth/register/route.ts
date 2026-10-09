import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/register — create a credentials account.
 * Auto sign-in afterwards is handled client-side via signIn('credentials').
 */

const registerSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email().max(120)),
  name: z.string().trim().max(24).optional(),
  password: z.string().min(8).max(72),
})

const MAX_BODY_BYTES = 4 * 1024

export async function POST(req: NextRequest) {
  try {
    const len = Number(req.headers.get('content-length') ?? '0')
    if (Number.isFinite(len) && len > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = registerSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid registration payload', issues: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { email, name, password } = parsed.data
    const exists = await db.user.findUnique({ where: { email } })
    if (exists) {
      return NextResponse.json({ error: '该邮箱已注册' }, { status: 409 })
    }

    try {
      const user = await db.user.create({
        data: {
          email,
          name: name && name.length > 0 ? name : email.split('@')[0],
          passwordHash: hashPassword(password),
        },
        select: { id: true, email: true, name: true },
      })

      return NextResponse.json(user, { status: 201 })
    } catch (error) {
      // Concurrent register with the same email won the race between the
      // findUnique above and this insert (P2002 unique violation) — the
      // correct answer is 409, not the generic 500 (#52).
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return NextResponse.json({ error: '该邮箱已注册' }, { status: 409 })
      }
      throw error
    }
  } catch (error) {
    console.error('[api/auth/register] POST failed:', error)
    return NextResponse.json(
      { error: 'Failed to register' },
      { status: 500 }
    )
  }
}
