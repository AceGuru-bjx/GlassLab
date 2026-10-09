import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { getSessionOrNull } from '@/lib/session'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/backgrounds/[id] — remove a custom background upload.
 * Ownership rules mirror presets: uploads owned by a user can only be
 * deleted by that user (403 otherwise); public uploads (userId = null)
 * stay openly deletable so junk rows can always be cleaned up.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id || id.length < 8 || id.length > 64) {
      return NextResponse.json({ error: 'Invalid background id' }, { status: 400 })
    }

    const existing = await db.backgroundImage.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Background not found' }, { status: 404 })
    }

    if (existing.userId) {
      const session = await getSessionOrNull()
      if (session?.user?.id !== existing.userId) {
        return NextResponse.json({ error: '无权删除他人上传的背景' }, { status: 403 })
      }
    }

    try {
      await db.backgroundImage.delete({ where: { id } })
    } catch (error) {
      // Concurrent delete won the race — the row is gone, which is what the
      // caller wanted. Report 404 instead of a bogus 500 (P2025).
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        return NextResponse.json({ error: 'Background not found' }, { status: 404 })
      }
      throw error
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/backgrounds/[id]] DELETE failed:', error)
    return NextResponse.json(
      { error: 'Failed to delete background' },
      { status: 500 }
    )
  }
}
