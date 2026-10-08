import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Zod schema mirroring GlassConfig (src/lib/glass/presets.ts).
 * Keeps malformed payloads out of the database.
 */

/**
 * Colors are interpolated into CSS strings downstream (saved-preset swatch
 * gradients, glow box-shadow), so only formats the lab actually produces are
 * accepted: #hex (3/4/6/8), rgb()/rgba()/hsl()/hsla() comma syntax, and
 * `transparent`. Everything else — including CSS-injection payloads — is 400.
 */
const COLOR_PATTERN =
  /^(?:#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(?:rgb|rgba|hsl|hsla)\(\s*-?\d+(?:\.\d+)?%?(?:\s*,\s*-?\d+(?:\.\d+)?%?){2,3}\s*\)|transparent)$/i

const colorField = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine(v => COLOR_PATTERN.test(v), {
      message:
        'Must be a color value: #hex, rgb()/rgba()/hsl()/hsla(), or "transparent"',
    })

const glassConfigSchema = z.object({
  refraction: z.number().min(0).max(120),
  height: z.number().min(1).max(150),
  dispersion: z.number().min(0).max(1),
  blur: z.number().min(0).max(60),
  saturation: z.number().min(0).max(300),
  cornerRadius: z.number().min(0).max(999),
  depthEffect: z.boolean(),
  highlight: z.number().min(0).max(1),
  tint: colorField(32),
  tintOpacity: z.number().min(0).max(1),
  overLight: z.boolean(),
  elasticity: z.number().min(0).max(1),
  glow: colorField(64),
})

const createPresetSchema = z.object({
  name: z.string().trim().min(1).max(48),
  config: glassConfigSchema,
})

/** Legit payloads are < 1KB; anything larger is rejected outright. */
const MAX_BODY_BYTES = 10 * 1024

/**
 * Parse a stored config string defensively. Corrupted rows (disk damage,
 * manual edits, historic bugs) must never take the whole endpoint down.
 */
function parseStoredConfig(raw: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(raw) }
  } catch {
    return { ok: false }
  }
}

/** GET /api/presets — list all saved glass presets (newest first). */
export async function GET() {
  try {
    const rows = await db.glassPreset.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    const presets = []
    for (const r of rows) {
      const parsed = parseStoredConfig(r.config)
      if (!parsed.ok) {
        // Skip corrupted rows so one bad record can't poison the whole list.
        // (The row remains deletable via DELETE /api/presets/[id].)
        console.warn('[api/presets] GET: skipping corrupted config row', r.id)
        continue
      }
      presets.push({
        id: r.id,
        name: r.name,
        config: parsed.value,
        createdAt: r.createdAt.toISOString(),
      })
    }
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
    const len = Number(req.headers.get('content-length') ?? '0')
    if (Number.isFinite(len) && len > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
    }

    // Client payload errors are 4xx, not server faults — keep JSON parsing
    // out of the generic 500 catch below.
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

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
