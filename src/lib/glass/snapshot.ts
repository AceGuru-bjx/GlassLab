/**
 * Full-size stage snapshot generator (Phase 6 M1).
 *
 * Rasterizes the current stage — background plus a centered glass card —
 * into a 1600×1000 PNG blob using Canvas2D only (no external deps). The
 * render pipeline mirrors cover.ts (glow → clipped backdrop blur/saturate →
 * tint → overLight → vignette → fresnel rim) but at 4× the area, so every
 * length is expressed in snapshot coordinates instead of being copied.
 *
 * Failure is always non-fatal (returns null) — a snapshot can never break
 * the lab. Callers show a toast instead.
 */

import type { GlassConfig } from './presets'

export interface SnapshotBackgroundSpec {
  /** image source (built-in wallpaper path or uploaded background raw URL) */
  imageUrl?: string
  /** gradient colors used when no image is available (css-gradient stages) */
  gradientColors?: string[]
  /** css-style gradient angle in degrees (0 = to top, clockwise) */
  gradientAngle?: number
}

const SNAP_W = 1600
const SNAP_H = 1000
/** glass card painted at 50%×50%, centered — same proportion as covers */
const CARD = { x: SNAP_W * 0.25, y: SNAP_H * 0.25, w: SNAP_W * 0.5, h: SNAP_H * 0.5 }
/** watermark footer strip */
const MARK_H = 44

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

function paintGradient(
  ctx: CanvasRenderingContext2D,
  colors: string[],
  angle: number
) {
  const a = ((angle % 360) + 360) % 360
  const rad = ((a - 90) * Math.PI) / 180
  const cx = SNAP_W / 2
  const cy = SNAP_H / 2
  const len =
    Math.abs(SNAP_W * Math.cos(rad)) + Math.abs(SNAP_H * Math.sin(rad))
  const dx = (Math.cos(rad) * len) / 2
  const dy = (Math.sin(rad) * len) / 2
  const grad = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy)
  colors.forEach((c, i) =>
    grad.addColorStop(colors.length === 1 ? 0 : i / (colors.length - 1), c)
  )
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, SNAP_W, SNAP_H)
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

function drawImageCoverFit(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement
) {
  const iw = img.naturalWidth || 1
  const ih = img.naturalHeight || 1
  const scale = Math.max(SNAP_W / iw, SNAP_H / ih)
  const w = iw * scale
  const h = ih * scale
  ctx.drawImage(img, (SNAP_W - w) / 2, (SNAP_H - h) / 2, w, h)
}

function paintWatermark(ctx: CanvasRenderingContext2D) {
  const stripY = SNAP_H - MARK_H
  ctx.save()
  // subtle dark strip so the text stays readable on any backdrop
  const strip = ctx.createLinearGradient(0, stripY, 0, SNAP_H)
  strip.addColorStop(0, 'rgba(0,0,0,0)')
  strip.addColorStop(1, 'rgba(0,0,0,0.38)')
  ctx.fillStyle = strip
  ctx.fillRect(0, stripY, SNAP_W, MARK_H)
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.font =
    '500 20px ui-sans-serif, system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  ctx.fillText('GlassLab · 玻璃实验室', SNAP_W - 24, stripY + MARK_H / 2)
  ctx.restore()
}

/**
 * Generate the stage snapshot as a PNG blob.
 * Returns null (instead of throwing) on any failure — snapshots are optional.
 */
export async function generateGlassSnapshot(
  spec: SnapshotBackgroundSpec,
  config: GlassConfig
): Promise<Blob | null> {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = SNAP_W
    canvas.height = SNAP_H
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    const colors =
      spec.gradientColors && spec.gradientColors.length > 0
        ? spec.gradientColors
        : ['#e2e8f0', '#f8fafc']
    const angle = spec.gradientAngle ?? 135

    // Same-origin only (built-in paths & /api/backgrounds/[id]/raw) — the
    // canvas stays untainted and toBlob keeps working.
    const img = spec.imageUrl ? await loadImage(spec.imageUrl) : null

    const paintBg = () => {
      if (img) drawImageCoverFit(ctx, img)
      else paintGradient(ctx, colors, angle)
    }

    // 1) background
    paintBg()

    // 2) glass card approximation — the card is 4× the cover card, so the
    //    corner radius scales with it (cover uses 0.6 on a 200px-wide card).
    const { x, y, w, h } = CARD
    const r = Math.min(Math.max(8, Math.min(config.cornerRadius, 64) * 2.4), w / 2, h / 2)

    // glow shadow behind the card
    if (config.glow && config.glow !== 'transparent') {
      ctx.save()
      ctx.shadowColor = config.glow
      ctx.shadowBlur = 96
      roundRectPath(ctx, x, y, w, h, r)
      ctx.fillStyle = 'rgba(255,255,255,0.01)'
      ctx.fill()
      ctx.restore()
    }

    // clipped backdrop sample with blur + saturation
    ctx.save()
    roundRectPath(ctx, x, y, w, h, r)
    ctx.clip()
    ctx.filter = `blur(${(config.blur * 3).toFixed(1)}px) saturate(${Math.round(config.saturation)}%)`
    paintBg()
    ctx.filter = 'none'

    // tint overlay
    if (config.tintOpacity > 0) {
      ctx.globalAlpha = Math.min(1, config.tintOpacity)
      ctx.fillStyle = config.tint
      ctx.fillRect(x - 16, y - 16, w + 32, h + 32)
      ctx.globalAlpha = 1
    }
    if (config.overLight) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.30)'
      ctx.fillRect(x - 16, y - 16, w + 32, h + 32)
    }

    // vignette approximation (radial corner darkening)
    const vg = Math.max(0, Math.min(1, config.vignette ?? 0))
    if (vg > 0.01) {
      const vgGrad = ctx.createRadialGradient(
        x + w / 2,
        y + h / 2,
        Math.min(w, h) * 0.3,
        x + w / 2,
        y + h / 2,
        Math.max(w, h) * 0.75
      )
      vgGrad.addColorStop(0, 'rgba(0,0,0,0)')
      vgGrad.addColorStop(1, `rgba(0,0,0,${(0.55 * vg).toFixed(3)})`)
      ctx.fillStyle = vgGrad
      ctx.fillRect(x, y, w, h)
    }
    ctx.restore()

    // fresnel rim highlight along lightAngle
    const hl = Math.max(0, Math.min(1, config.highlight))
    if (hl > 0.02) {
      const rad2 = (config.lightAngle * Math.PI) / 180
      const dirx = Math.sin(rad2)
      const diry = -Math.cos(rad2)
      const cx = x + w / 2
      const cy = y + h / 2
      const L = Math.max(w, h)
      const g = ctx.createLinearGradient(
        cx - (dirx * L) / 2,
        cy - (diry * L) / 2,
        cx + (dirx * L) / 2,
        cy + (diry * L) / 2
      )
      g.addColorStop(0, `rgba(255,255,255,${(hl * 0.95).toFixed(2)})`)
      g.addColorStop(0.5, `rgba(255,255,255,${(hl * 0.12).toFixed(2)})`)
      g.addColorStop(1, `rgba(255,255,255,${(hl * 0.4).toFixed(2)})`)
      ctx.strokeStyle = g
      ctx.lineWidth = 10
      roundRectPath(ctx, x + 4, y + 4, w - 8, h - 8, Math.max(4, r - 4))
      ctx.stroke()
    }

    paintWatermark(ctx)

    return await new Promise<Blob | null>(resolve =>
      canvas.toBlob(blob => resolve(blob), 'image/png')
    )
  } catch {
    return null
  }
}
