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
import { drawTextureApproximations } from './textures'

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

    // Phase 11 M1: directional cast shadow — falls along the lightAngle
    // direction (opposite the fresnel bright edge): dx=sin(θ)·d, dy=-cos(θ)·d
    // in canvas coords (y grows downward, same as CSS).
    // Phase 12 M2: shadow tint — #0f172a default reproduces Phase 11 exactly.
    const shadowIntensity = Math.max(0, Math.min(1, config.shadowIntensity ?? 0))
    if (shadowIntensity > 0.01) {
      const shadowDistance = Math.max(0, Math.min(40, config.shadowDistance ?? 14))
      const shadowSoftness = Math.max(0, Math.min(60, config.shadowSoftness ?? 28))
      const shadowColor =
        typeof config.shadowColor === 'string' && config.shadowColor.trim()
          ? config.shadowColor
          : '#0f172a'
      const rad0 = (config.lightAngle * Math.PI) / 180
      ctx.save()
      ctx.shadowColor = withAlpha(shadowColor, 0.5 * shadowIntensity)
      ctx.shadowOffsetX = Math.sin(rad0) * shadowDistance * 1.1
      ctx.shadowOffsetY = -Math.cos(rad0) * shadowDistance * 1.1
      ctx.shadowBlur = shadowSoftness * 1.1
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

    // Phase 9 M2: brushed streaks / bubbles approximations (Phase 11 M2:
    // brushedFollow bakes the light-perpendicular angle into the canvas)
    drawTextureApproximations(ctx, { x, y, w, h }, {
      ...config,
      brushedAngle: config.brushedFollow
        ? (((Math.round(config.lightAngle) + 90) % 360) + 360) % 360
        : config.brushedAngle,
    })

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

    // Phase 14 M1: iridescence approximation — a spectral conic stroke over
    // the edge band (createConicGradient, feature-detected; older browsers
    // silently skip it — covers are best-effort, never fatal). Canvas conic
    // starts at +x clockwise, CSS `from` at 12 o'clock — offset by -90°.
    const iri = Math.max(0, Math.min(1, config.iridescence ?? 0))
    if (iri > 0.01 && typeof ctx.createConicGradient === 'function') {
      const iriW = Math.max(2, Math.min(12, config.iridescenceWidth ?? 5))
      const start = ((config.lightAngle - 90) * Math.PI) / 180
      const cg = ctx.createConicGradient(start, x + w / 2, y + h / 2)
      const a = (f: number) => iri * f
      cg.addColorStop(0, `rgba(255, 130, 130, ${a(0.5).toFixed(3)})`)
      cg.addColorStop(0.125, `rgba(255, 200, 100, ${a(0.55).toFixed(3)})`)
      cg.addColorStop(0.25, `rgba(255, 240, 140, ${a(0.5).toFixed(3)})`)
      cg.addColorStop(0.375, `rgba(150, 240, 150, ${a(0.55).toFixed(3)})`)
      cg.addColorStop(0.5, `rgba(120, 225, 255, ${a(0.6).toFixed(3)})`)
      cg.addColorStop(0.625, `rgba(150, 165, 255, ${a(0.55).toFixed(3)})`)
      cg.addColorStop(0.75, `rgba(220, 145, 255, ${a(0.5).toFixed(3)})`)
      cg.addColorStop(0.875, `rgba(255, 130, 200, ${a(0.45).toFixed(3)})`)
      cg.addColorStop(1, `rgba(255, 130, 130, ${a(0.5).toFixed(3)})`)
      ctx.strokeStyle = cg
      ctx.lineWidth = iriW * 0.75
      roundRectPath(ctx, x + 1, y + 1, w - 2, h - 2, Math.max(1, r - 1))
      ctx.stroke()
    }

    return canvas.toDataURL('image/jpeg', 0.78)
  } catch {
    return null
  }
}
