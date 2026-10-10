import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getSessionOrNull } from '@/lib/session'

export const dynamic = 'force-dynamic'

/**
 * Phase 4 M1: favorite toggle payload. Single boolean — anything else is a
 * client bug and gets 400.
 */
const patchSchema = z.object({ favorite: z.boolean() })

/** The legit payload is ~20 bytes; anything bigger is abusive. */
const MAX_PATCH_BODY_BYTES = 1024

/**
 * Parse a stored config string defensively. Corrupted rows (disk damage,
 * manual edits, historic bugs) must surface as an identifiable response,
 * not a 500.
 */
function parseStoredConfig(
  raw: string
): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(raw) }
  } catch {
    return { ok: false }
  }
}

/**
 * DELETE /api/presets/[id] — remove a saved glass preset.
 * Ownership rules: presets owned by a user can only be deleted by that user
 * (403 otherwise); public presets (userId = null) stay openly deletable so
 * corrupted rows can always be cleaned up.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id || id.length < 8 || id.length > 64) {
      return NextResponse.json({ error: 'Invalid preset id' }, { status: 400 })
    }

    const existing = await db.glassPreset.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Preset not found' }, { status: 404 })
    }

    if (existing.userId) {
      const session = await getSessionOrNull()
      if (session?.user?.id !== existing.userId) {
        return NextResponse.json(
          { error: '无权删除他人预设' },
          { status: 403 }
        )
      }
    }

    try {
      await db.glassPreset.delete({ where: { id } })
    } catch (error) {
      // Concurrent delete won the race — the preset is gone, which is what
      // the caller wanted. Report 404 instead of a bogus 500 (P2025).
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        return NextResponse.json({ error: 'Preset not found' }, { status: 404 })
      }
      throw error
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/presets/[id]] DELETE failed:', error)
    return NextResponse.json(
      { error: 'Failed to delete preset' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/presets/[id] — toggle the favorite flag (Phase 4 M1).
 * Ownership rules mirror DELETE: private presets only toggleable by their
 * owner (403 otherwise); public presets stay openly toggleable, consistent
 * with the guest-deletion capability.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id || id.length < 8 || id.length > 64) {
      return NextResponse.json({ error: 'Invalid preset id' }, { status: 400 })
    }

    const len = Number(req.headers.get('content-length') ?? '0')
    if (Number.isFinite(len) && len > MAX_PATCH_BODY_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
    }

    // Client payload errors are 4xx, not server faults.
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', issues: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const existing = await db.glassPreset.findUnique({
      where: { id },
      select: { id: true, userId: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Preset not found' }, { status: 404 })
    }

    if (existing.userId) {
      const session = await getSessionOrNull()
      if (session?.user?.id !== existing.userId) {
        return NextResponse.json(
          { error: '无权修改他人预设' },
          { status: 403 }
        )
      }
    }

    try {
      const row = await db.glassPreset.update({
        where: { id },
        data: { favorite: parsed.data.favorite },
      })
      return NextResponse.json({ ok: true, id, favorite: row.favorite })
    } catch (error) {
      // Concurrent delete won the race — nothing left to favorite (P2025).
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        return NextResponse.json({ error: 'Preset not found' }, { status: 404 })
      }
      throw error
    }
  } catch (error) {
    console.error('[api/presets/[id]] PATCH failed:', error)
    return NextResponse.json(
      { error: 'Failed to update preset' },
      { status: 500 }
    )
  }
}

/** GET /api/presets/[id] — fetch a single preset. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    // Shape guard mirrors DELETE/PATCH (#81): a bogus id is a client error
    // (400), not a missing resource (404), and never reaches SQLite.
    if (!id || id.length < 8 || id.length > 64) {
      return NextResponse.json({ error: 'Invalid preset id' }, { status: 400 })
    }
    const row = await db.glassPreset.findUnique({ where: { id } })
    if (!row) {
      return NextResponse.json({ error: 'Preset not found' }, { status: 404 })
    }
    // Visibility check mirrors DELETE/PATCH: private presets (userId set) are
    // only readable by their owner — the list endpoint already scopes by
    // session, so a single-row read must not become a privacy bypass (#51).
    if (row.userId) {
      const session = await getSessionOrNull()
      if (session?.user?.id !== row.userId) {
        return NextResponse.json(
          { error: '无权访问该预设' },
          { status: 403 }
        )
      }
    }
    const parsed = parseStoredConfig(row.config)
    return NextResponse.json({
      id: row.id,
      name: row.name,
      config: parsed.ok ? parsed.value : null,
      cover: row.cover,
      corrupt: !parsed.ok,
      createdAt: row.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('[api/presets/[id]] GET failed:', error)
    return NextResponse.json(
      { error: 'Failed to load preset' },
      { status: 500 }
    )
  }
}
