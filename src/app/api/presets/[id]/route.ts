import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

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

    await db.glassPreset.delete({ where: { id } })
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
    return NextResponse.json({
      id: row.id,
      name: row.name,
      config: JSON.parse(row.config),
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
