/**
 * Client-side cover snapshot generator for saved presets (Phase 3 M2).
 *
 * Rasterizes a 400×240 approximation of the stage — background plus glass
 * card — into a JPEG data URL using Canvas2D only (no external deps).
 * The glass card is approximated with canvas primitives: a clipped backdrop
 * sample (blur + saturation), tint overlay, fresnel rim along `lightAngle`
 * and an optional glow shadow.
 *
 * Failure is always non-fatal (returns null) so generating a cover can never
 * block saving a preset.
 */

import type { GlassConfig } from './presets'
import { scaleColorAlpha, withAlpha } from './color'

export interface CoverBackgroundSpec {
  /** image source (built-in wallpaper path or uploaded background raw URL) */
  imageUrl?: string
  /** gradient colors used when no image is available (css-gradient stages) */
  gradientColors?: string[]
  /** css-style gradient angle in degrees (0 = to top, clockwise) */
  gradientAngle?: number
}

const COVER_W = 400
const COVER_H = 240
/** glass card box painted inside the cover */
const CARD = { x: 100, y: 60, w: 200, h: 120 }

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
  const cx = COVER_W / 2
  const cy = COVER_H / 2
  const len =
    Math.abs(COVER_W * Math.cos(rad)) + Math.abs(COVER_H * Math.sin(rad))
  const dx = (Math.cos(rad) * len) / 2
  const dy = (Math.sin(rad) * len) / 2
  const grad = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy)
  colors.forEach((c, i) =>
    grad.addColorStop(colors.length === 1 ? 0 : i / (colors.length - 1), c)
  )
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, COVER_W, COVER_H)
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

function drawImageCoverFit(ctx: CanvasRenderingContext2D, img: HTMLImageElement) {
  const iw = img.naturalWidth || 1
  const ih = img.naturalHeight || 1
  const scale = Math.max(COVER_W / iw, COVER_H / ih)
  const w = iw * scale
  const h = ih * scale
  ctx.drawImage(img, (COVER_W - w) / 2, (COVER_H - h) / 2, w, h)
}

/**
 * Generate a cover data URL for the given background + glass config.
 * Returns null (instead of throwing) on any failure — covers are optional.
 */
export async function generateGlassCover(
  spec: CoverBackgroundSpec,
  config: GlassConfig
): Promise<string | null> {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = COVER_W
    canvas.height = COVER_H
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    const colors =
      spec.gradientColors && spec.gradientColors.length > 0
        ? spec.gradientColors
        : ['#e2e8f0', '#f8fafc']
    const angle = spec.gradientAngle ?? 135

    // Same-origin only (built-in paths & /api/backgrounds/[id]/raw) — the
    // canvas stays untainted and toDataURL keeps working.
    const img = spec.imageUrl ? await loadImage(spec.imageUrl) : null

    const paintBg = () => {
      if (img) drawImageCoverFit(ctx, img)
      else paintGradient(ctx, colors, angle)
    }

    // 1) background
    paintBg()

    // 2) glass card approximation
    const { x, y, w, h } = CARD
    const r = Math.max(4, Math.min(config.cornerRadius, 64) * 0.6)

    // glow shadow behind the card (Phase 9: intensity & radius params)
    if (config.glow && config.glow !== 'transparent') {
      ctx.save()
      ctx.shadowColor = scaleColorAlpha(config.glow, Math.max(0, Math.min(1, config.glowOpacity ?? 1)))
      ctx.shadowBlur = Math.max(0, Math.min(60, config.glowSpread ?? 24)) * 1.1
      roundRectPath(ctx, x, y, w, h, r)
      ctx.fillStyle = 'rgba(255,255,255,0.01)'
      ctx.fill()
      ctx.restore()
    }

    // clipped backdrop sample with blur + saturation
    ctx.save()
    roundRectPath(ctx, x, y, w, h, r)
    ctx.clip()
    ctx.filter = `blur(${(config.blur * 0.75).toFixed(1)}px) saturate(${Math.round(config.saturation)}%)`
    paintBg()
    ctx.filter = 'none'

    // tint overlay
    if (config.tintOpacity > 0) {
      ctx.globalAlpha = Math.min(1, config.tintOpacity)
      ctx.fillStyle = config.tint
      ctx.fillRect(x - 4, y - 4, w + 8, h + 8)
      ctx.globalAlpha = 1
    }
    if (config.overLight) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.30)'
      ctx.fillRect(x - 4, y - 4, w + 8, h + 8)
    }

    // Phase 5 vignette approximation (radial corner darkening).
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
      const hlColor =
        typeof config.highlightColor === 'string' && config.highlightColor.trim()
          ? config.highlightColor
          : '#ffffff'
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
      // Phase 8: fresnel stops follow the user-chosen highlight color.
      g.addColorStop(0, withAlpha(hlColor, hl * 0.95))
      g.addColorStop(0.5, withAlpha(hlColor, hl * 0.12))
      g.addColorStop(1, withAlpha(hlColor, hl * 0.4))
      ctx.strokeStyle = g
      ctx.lineWidth = 2.5
      roundRectPath(ctx, x + 1, y + 1, w - 2, h - 2, Math.max(1, r - 1))
      ctx.stroke()
    }

    return canvas.toDataURL('image/jpeg', 0.78)
  } catch {
    return null
  }
}
