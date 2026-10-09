import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUserIdOrNull } from '@/lib/session'
import { MAX_UPLOAD_BYTES, sniffImageMime } from '@/lib/backgrounds'

export const dynamic = 'force-dynamic'

/**
 * GET /api/backgrounds — list custom uploads visible to the caller
 * (newest first). Session semantics mirror /api/presets: signed-in users
 * see their own uploads, guests see public ones (userId = null).
 * Byte bodies are never included — clients use the /raw endpoint.
 */
export async function GET() {
  try {
    // Validated lookup: a stale JWT (deleted account) degrades to guest
    // visibility instead of an empty private set.
    const userId = await getSessionUserIdOrNull()
    const rows = await db.backgroundImage.findMany({
      where: userId ? { userId } : { userId: null },
      orderBy: { createdAt: 'desc' },
      take: 60,
      select: {
        id: true,
        name: true,
        mimeType: true,
        size: true,
        createdAt: true,
      },
    })
    return NextResponse.json(
      rows.map(r => ({
        id: r.id,
        name: r.name,
        mimeType: r.mimeType,
        size: r.size,
        url: `/api/backgrounds/${r.id}/raw`,
        createdAt: r.createdAt.toISOString(),
      }))
    )
  } catch (error) {
    console.error('[api/backgrounds] GET failed:', error)
    return NextResponse.json(
      { error: 'Failed to load backgrounds' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/backgrounds — multipart upload of a custom stage background.
 * Validation layers: size cap (5MB → 413), form shape (400) and magic-byte
 * sniffing (400) so a renamed .exe can never become a "png".
 */
export async function POST(req: NextRequest) {
  try {
    // Cheap pre-guard before buffering anything (multipart overhead ≈ 1KB).
    const len = Number(req.headers.get('content-length') ?? '0')
    if (Number.isFinite(len) && len > MAX_UPLOAD_BYTES + 64 * 1024) {
      return NextResponse.json(
        { error: '图片过大，最大 5MB' },
        { status: 413 }
      )
    }

    let form: FormData
    try {
      form = await req.formData()
    } catch {
      return NextResponse.json({ error: 'Invalid form body' }, { status: 400 })
    }

    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: '缺少文件字段 file' }, { status: 400 })
    }
    if (file.size === 0) {
      return NextResponse.json({ error: '空文件' }, { status: 400 })
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: '图片过大，最大 5MB' }, { status: 413 })
    }

    const rawName = form.get('name')
    let name = typeof rawName === 'string' ? rawName.trim().slice(0, 48) : ''
    if (!name) {
      name = (file.name || '').trim().slice(0, 48) || '自定义背景'
    }

    // Magic-byte sniffing — the authoritative type check.
    const buf = Buffer.from(await file.arrayBuffer())
    const mime = sniffImageMime(buf)
    if (!mime) {
      return NextResponse.json(
        { error: '仅支持 png / jpeg / webp / gif 图片' },
        { status: 400 }
      )
    }

    const userId = await getSessionUserIdOrNull()
    const row = await db.backgroundImage.create({
      data: {
        name,
        mimeType: mime,
        size: buf.length,
        data: buf,
        // Signed-in → private upload owned by the user; guest → public.
        userId,
      },
    })

    return NextResponse.json(
      {
        id: row.id,
        name: row.name,
        mimeType: row.mimeType,
        size: row.size,
        url: `/api/backgrounds/${row.id}/raw`,
        createdAt: row.createdAt.toISOString(),
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[api/backgrounds] POST failed:', error)
    return NextResponse.json({ error: '上传失败，请重试' }, { status: 500 })
  }
}
