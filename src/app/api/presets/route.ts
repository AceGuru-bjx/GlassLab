import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Zod schema mirroring GlassConfig (src/lib/glass/presets.ts).
 * Keeps malformed payloads out of the database.
 */
const glassConfigSchema = z.object({
  refraction: z.number().min(0).max(120),
  height: z.number().min(1).max(150),
  dispersion: z.number().min(0).max(1),
  blur: z.number().min(0).max(60),
  saturation: z.number().min(0).max(300),
  cornerRadius: z.number().min(0).max(999),
  depthEffect: z.boolean(),
  highlight: z.number().min(0).max(1),
  tint: z.string().min(1).max(32),
  tintOpacity: z.number().min(0).max(1),
  overLight: z.boolean(),
  elasticity: z.number().min(0).max(1),
  glow: z.string().min(1).max(64),
})

const createPresetSchema = z.object({
  name: z.string().trim().min(1).max(48),
  config: glassConfigSchema,
})

/** GET /api/presets — list all saved glass presets (newest first). */
export async function GET() {
  try {
    const rows = await db.glassPreset.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    const presets = rows.map(r => ({
      id: r.id,
      name: r.name,
      config: JSON.parse(r.config),
      createdAt: r.createdAt.toISOString(),
    }))
    return NextResponse.json(presets)
  } catch (error) {
    console.error('[api/presets] GET failed:', error)
    return NextResponse.json(
      { error: 'Failed to load presets' },
      { status: 500 }
    )
  }
}

/** POST /api/presets — save a glass preset. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = createPresetSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid preset payload', issues: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const row = await db.glassPreset.create({
      data: {
        name: parsed.data.name,
        config: JSON.stringify(parsed.data.config),
      },
    })

    return NextResponse.json(
      {
        id: row.id,
        name: row.name,
        config: parsed.data.config,
        createdAt: row.createdAt.toISOString(),
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[api/presets] POST failed:', error)
    return NextResponse.json(
      { error: 'Failed to save preset' },
      { status: 500 }
    )
  }
}
