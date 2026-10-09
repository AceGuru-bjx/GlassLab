import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionOrNull } from '@/lib/session'

export const dynamic = 'force-dynamic'

/**
 * GET /api/backgrounds/[id]/raw — serve the image bytes with the sniffed
 * content type. Private uploads (userId set) require the owner's session —
 * same-origin <img> requests carry cookies, so this stays transparent for
 * the legit UI while blocking anonymous scraping of private rows.
 * Content-addressed by immutable id → cache aggressively.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id || id.length < 8 || id.length > 64) {
      return NextResponse.json({ error: 'Invalid background id' }, { status: 400 })
    }

    const row = await db.backgroundImage.findUnique({
      where: { id },
      select: { data: true, mimeType: true, userId: true },
    })
    if (!row) {
      return NextResponse.json({ error: 'Background not found' }, { status: 404 })
    }

    if (row.userId) {
      const session = await getSessionOrNull()
      if (session?.user?.id !== row.userId) {
        return NextResponse.json({ error: '无权访问该背景' }, { status: 403 })
      }
    }

    const blob = new Blob([row.data as BlobPart], { type: row.mimeType })
    return new NextResponse(blob, {
      status: 200,
      headers: {
        'Content-Type': row.mimeType,
        'Content-Length': String(blob.size),
        'Cache-Control': 'private, max-age=31536000, immutable',
      },
    })
  } catch (error) {
    console.error('[api/backgrounds/[id]/raw] GET failed:', error)
    return NextResponse.json(
      { error: 'Failed to load background' },
      { status: 500 }
    )
  }
}
