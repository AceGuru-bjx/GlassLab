import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

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

/** DELETE /api/presets/[id] — remove a saved glass preset. */
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

/** GET /api/presets/[id] — fetch a single preset. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const row = await db.glassPreset.findUnique({ where: { id } })
    if (!row) {
      return NextResponse.json({ error: 'Preset not found' }, { status: 404 })
    }
    const parsed = parseStoredConfig(row.config)
    return NextResponse.json({
      id: row.id,
      name: row.name,
      config: parsed.ok ? parsed.value : null,
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
