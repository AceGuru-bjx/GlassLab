/**
 * Phase 9 M2 texture data-URIs — zero-JS SVG patterns shared by the live
 * engine overlays (liquid-glass.tsx) and the CSS/React exports (export.ts),
 * the same technique the Phase 5 frost noise has shipped with since #49.
 *
 * Phase 10 (#89/#90) makes both textures parametric:
 *  - brushed: `brushedAngle` rotates the tiling grid via SVG
 *    `<pattern patternTransform>` — the transform applies to the whole
 *    infinite tiling, so seamlessness is preserved at any angle.
 *  - bubbles: `bubbleSize` scales radii, `bubbleDensity` scales the count
 *    (procedural LCG layout). The legacy 8-bubble layout stays
 *    byte-identical for size=1/density=1 — Phase 9 presets must not drift.
 *
 * Both generators bake the layer intensity into the SVG itself (feColorMatrix
 * alpha row / stop-color alphas), so the caller never needs a separate
 * `opacity` — which matters for the CSS export where the root element cannot
 * take an overlay opacity without dimming its children.
 */

/** The Phase 9 hand-tuned 8-bubble layout in the 200×200 tile: [cx, cy, r]. */
const BUBBLE_LAYOUT: ReadonlyArray<readonly [number, number, number]> = [
  [28, 36, 14],
  [96, 18, 7],
  [158, 52, 11],
  [66, 112, 18],
  [136, 140, 9],
  [44, 172, 6],
  [180, 186, 12],
  [108, 78, 5],
]

/** Deterministic LCG so texture approximations render identically twice. */
function lcg(seed: number): () => number {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

/** Clamp helper shared by every parametric texture entry point. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo))
}

/**
 * Procedural bubble layout for density ≠ 1 — deterministic rejection
 * sampling: every bubble stays fully inside the tile (seamless tiling)
 * and never heavily overlaps a sibling. Count is capped so pathological
 * densities can never spin the generator.
 */
function proceduralBubbleLayout(
  density: number,
  size: number
): Array<[number, number, number]> {
  const count = Math.max(1, Math.min(28, Math.round(8 * density)))
  const rnd = lcg(20260210)
  const out: Array<[number, number, number]> = []
  let attempts = 0
  while (out.length < count && attempts < count * 60) {
    attempts++
    const r = (4 + rnd() * 14) * size
    // Keep a 2px safety margin so the sphere's soft edge never crosses the
    // tile boundary (the tile repeats — a cut bubble would tile visibly).
    if (r > 96) continue
    const cx = r + 2 + rnd() * (200 - 2 * r - 4)
    const cy = r + 2 + rnd() * (200 - 2 * r - 4)
    let ok = true
    for (const [x, y, pr] of out) {
      if (Math.hypot(cx - x, cy - y) < (r + pr) * 0.6) {
        ok = false
        break
      }
    }
    if (ok) out.push([cx, cy, r])
  }
  return out
}

/** Resolve the effective bubble layout for a size/density pair. */
function effectiveBubbleLayout(
  size: number,
  density: number
): ReadonlyArray<readonly [number, number, number]> {
  if (size === 1 && density === 1) return BUBBLE_LAYOUT
  if (size === 1) return proceduralBubbleLayout(density, 1)
  // size ≠ 1: scale radii over the (possibly procedural) base layout.
  const base =
    density === 1
      ? BUBBLE_LAYOUT
      : proceduralBubbleLayout(density, 1)
  return base.map(([x, y, r]) => [x, y, Math.min(r * size, 96)] as const)
}

/**
 * Brushed-metal streaks: anisotropic feTurbulence (baseFrequency fx ≪ fy
 * stretches the noise into bands) read back as near-white sheen whose alpha
 * carries the streak structure.
 *
 * @param alphaK overall visibility 0..1 (engine passes brushed × 0.4)
 * @param angleDeg streak direction 0..360 (0 = horizontal). Non-zero angles
 *   rotate the tiling grid with `<pattern patternTransform>` — angle 0 keeps
 *   the Phase 9 pattern-free output byte-identical.
 */
export function brushedDataUri(alphaK: number, angleDeg = 0): string {
  const k = Math.max(0, Math.min(1, alphaK)).toFixed(4)
  const a = Math.round(clamp(angleDeg, 0, 360)) % 360
  if (a === 0) {
    return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='br'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.012 0.85' numOctaves='3' seed='7' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0.33 0.33 0.33 0 0.5 0.33 0.33 0.33 0 0.5 0.33 0.33 0.33 0 0.5 ${k} 0 0 0 0'/%3E%3C/filter%3E%3Crect width='240' height='240' filter='url(%23br)'/%3E%3C/svg%3E`
  }
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cdefs%3E%3Cfilter id='br' x='-20%25' y='-20%25' width='140%25' height='140%25'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.012 0.85' numOctaves='3' seed='7' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0.33 0.33 0.33 0 0.5 0.33 0.33 0.33 0 0.5 0.33 0.33 0.33 0 0.5 ${k} 0 0 0 0'/%3E%3C/filter%3E%3Cpattern id='bp' width='240' height='240' patternUnits='userSpaceOnUse' patternTransform='rotate(${a})'%3E%3Crect width='240' height='240' filter='url(%23br)'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width='240' height='240' fill='url(%23bp)'/%3E%3C/svg%3E`
}

/**
 * Tile of soft gas bubbles — each a radial-gradient sphere with an
 * off-center highlight, a dim body and a bright rim, fading out at the
 * edge. Tiles seamlessly (200×200) as a background-image.
 *
 * @param alphaK overall visibility 0..1 (engine passes bubbles × 0.55)
 * @param size radius scale 0.4..2.2 (default 1 = Phase 9 layout)
 * @param density count scale 0.3..2.5 (default 1 = 8 bubbles)
 */
export function bubblesDataUri(alphaK: number, size = 1, density = 1): string {
  const a = (base: number) =>
    Math.max(0, Math.min(1, base * alphaK)).toFixed(3)
  const s = clamp(size, 0.4, 2.2)
  const d = clamp(density, 0.3, 2.5)
  const circles = effectiveBubbleLayout(s, d)
    .map(([cx, cy, r]) => {
      const rx = Math.round(cx * 10) / 10
      const ry = Math.round(cy * 10) / 10
      const rr = Math.round(r * 10) / 10
      return `%3Ccircle cx='${rx}' cy='${ry}' r='${rr}' fill='url(%23b)'/%3E`
    })
    .join('')
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cdefs%3E%3CradialGradient id='b' cx='0.35' cy='0.3'%3E%3Cstop offset='0' stop-color='rgba(255,255,255,${a(
    0.85
  )})'/%3E%3Cstop offset='0.55' stop-color='rgba(255,255,255,${a(
    0.08
  )})'/%3E%3Cstop offset='0.88' stop-color='rgba(255,255,255,${a(
    0.35
  )})'/%3E%3Cstop offset='1' stop-color='rgba(255,255,255,0)'/%3E%3C/radialGradient%3E%3C/defs%3E${circles}%3C/svg%3E`
}

/** Phase 10 M2: bubble rise period (seconds) for a 0..1 speed param. */
export function bubbleRisePeriodSec(bubbleRise: number): string {
  return (8 - 6.5 * clamp(bubbleRise, 0, 1)).toFixed(1)
}

/** Phase 13 M1: horizontal drift sway period (seconds) — shares the rise
 * period family so the two axes stay rhythmically coupled (a phase-offset
 * spiral rather than two unrelated metronomes). Drift alone sways slower. */
export function bubbleDriftPeriodSec(bubbleDrift: number, bubbleRise: number): string {
  const risePeriod = 8 - 6.5 * clamp(bubbleRise, 0, 1)
  const sway = 9 - 4 * clamp(bubbleDrift, 0, 1)
  // When both run, lock the sway to ~1.33× the rise period (4:3 coupling —
  // the combined path reads as a spiral instead of a Lissajous knot).
  return ((bubbleRise > 0.01 ? risePeriod * 1.33 : sway) + 0.05).toFixed(1)
}

/** Phase 13 M1: drift sway amplitude in px (0..1 → 0..60px). */
export function bubbleDriftAmpPx(bubbleDrift: number): number {
  return Math.round(clamp(bubbleDrift, 0, 1) * 60)
}

// ---------------------------------------------------------------------------
// Canvas2D approximations for the cover/snapshot generators (the SVG
// data-URIs would need an async image decode; canvas primitives are the
// sync equivalent). Deterministic — no Math.random, so covers are stable.
// ---------------------------------------------------------------------------

/**
 * Draw the brushed/bubbles texture approximations inside the card clip.
 * Mirrors the data-URI layers: sheen lines along `brushedAngle` and
 * radial-gradient spheres with the same highlight/rim stop structure.
 */
export function drawTextureApproximations(
  ctx: CanvasRenderingContext2D,
  card: { x: number; y: number; w: number; h: number },
  config: {
    brushed?: number
    brushedAngle?: number
    bubbles?: number
    bubbleSize?: number
    bubbleDensity?: number
  }
): void {
  const brushed = clamp(config.brushed ?? 0, 0, 1)
  const brushedAngle = clamp(config.brushedAngle ?? 0, 0, 360)
  const bubbles = clamp(config.bubbles ?? 0, 0, 1)
  const bubbleSize = clamp(config.bubbleSize ?? 1, 0.4, 2.2)
  const bubbleDensity = clamp(config.bubbleDensity ?? 1, 0.3, 2.5)
  const { x, y, w, h } = card
  if (brushed > 0.01) {
    const k = brushed * 0.4
    const rnd = lcg(7)
    const rad = (brushedAngle * Math.PI) / 180
    ctx.save()
    // Rotate the streak frame around the card centre; lines span the full
    // diagonal so any angle covers the whole card.
    ctx.translate(x + w / 2, y + h / 2)
    ctx.rotate(rad)
    ctx.lineWidth = 1
    const diag = Math.hypot(w, h) / 2 + 4
    for (let ly = -diag; ly < diag; ly += 3) {
      ctx.strokeStyle = `rgba(255,255,255,${(k * (0.25 + rnd() * 0.75)).toFixed(3)})`
      ctx.beginPath()
      ctx.moveTo(-diag, ly)
      ctx.lineTo(diag, ly + (rnd() - 0.5) * 2)
      ctx.stroke()
    }
    ctx.restore()
  }
  if (bubbles > 0.01) {
    const k = bubbles * 0.55
    ctx.save()
    const scale = h / 200
    for (const [bx, by, br] of effectiveBubbleLayout(bubbleSize, bubbleDensity)) {
      const cx = x + (bx / 200) * w
      const cy = y + (by / 200) * h
      const r = br * scale
      if (r < 1.5) continue
      // Off-center highlight at (0.35, 0.3) of the bounding box, matching
      // the SVG radialGradient geometry.
      const g = ctx.createRadialGradient(
        cx - r * 0.3,
        cy - r * 0.4,
        r * 0.1,
        cx,
        cy,
        r
      )
      g.addColorStop(0, `rgba(255,255,255,${(0.85 * k).toFixed(3)})`)
      g.addColorStop(0.55, `rgba(255,255,255,${(0.08 * k).toFixed(3)})`)
      g.addColorStop(0.88, `rgba(255,255,255,${(0.35 * k).toFixed(3)})`)
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }
}
