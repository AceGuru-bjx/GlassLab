/**
 * Phase 9 M2 texture data-URIs — zero-JS SVG patterns shared by the live
 * engine overlays (liquid-glass.tsx) and the CSS/React exports (export.ts),
 * the same technique the Phase 5 frost noise has shipped with since #49.
 *
 * Both generators bake the layer intensity into the SVG itself (feColorMatrix
 * alpha row / stop-color alphas), so the caller never needs a separate
 * `opacity` — which matters for the CSS export where the root element cannot
 * take an overlay opacity without dimming its children.
 */

/**
 * Horizontal brushed-metal streaks: anisotropic feTurbulence
 * (baseFrequency fx ≪ fy stretches the noise into horizontal bands) read
 * back as near-white sheen whose alpha carries the streak structure.
 *
 * @param alphaK overall visibility 0..1 (engine passes brushed × 0.4)
 */
export function brushedDataUri(alphaK: number): string {
  const k = Math.max(0, Math.min(1, alphaK)).toFixed(4)
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='br'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.012 0.85' numOctaves='3' seed='7' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0.33 0.33 0.33 0 0.5 0.33 0.33 0.33 0 0.5 0.33 0.33 0.33 0 0.5 ${k} 0 0 0 0'/%3E%3C/filter%3E%3Crect width='240' height='240' filter='url(%23br)'/%3E%3C/svg%3E`
}

/**
 * Tile of soft gas bubbles — each a radial-gradient sphere with an
 * off-center highlight, a dim body and a bright rim, fading out at the
 * edge. Tiles seamlessly (200×200, 8 bubbles) as a background-image.
 *
 * @param alphaK overall visibility 0..1 (engine passes bubbles × 0.55)
 */
export function bubblesDataUri(alphaK: number): string {
  const a = (base: number) =>
    Math.max(0, Math.min(1, base * alphaK)).toFixed(3)
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cdefs%3E%3CradialGradient id='b' cx='0.35' cy='0.3'%3E%3Cstop offset='0' stop-color='rgba(255,255,255,${a(
    0.85
  )})'/%3E%3Cstop offset='0.55' stop-color='rgba(255,255,255,${a(
    0.08
  )})'/%3E%3Cstop offset='0.88' stop-color='rgba(255,255,255,${a(
    0.35
  )})'/%3E%3Cstop offset='1' stop-color='rgba(255,255,255,0)'/%3E%3C/radialGradient%3E%3C/defs%3E%3Ccircle cx='28' cy='36' r='14' fill='url(%23b)'/%3E%3Ccircle cx='96' cy='18' r='7' fill='url(%23b)'/%3E%3Ccircle cx='158' cy='52' r='11' fill='url(%23b)'/%3E%3Ccircle cx='66' cy='112' r='18' fill='url(%23b)'/%3E%3Ccircle cx='136' cy='140' r='9' fill='url(%23b)'/%3E%3Ccircle cx='44' cy='172' r='6' fill='url(%23b)'/%3E%3Ccircle cx='180' cy='186' r='12' fill='url(%23b)'/%3E%3Ccircle cx='108' cy='78' r='5' fill='url(%23b)'/%3E%3C/svg%3E`
}

// ---------------------------------------------------------------------------
// Canvas2D approximations for the cover/snapshot generators (the SVG
// data-URIs would need an async image decode; canvas primitives are the
// sync equivalent). Deterministic — no Math.random, so covers are stable.
// ---------------------------------------------------------------------------

/** Deterministic LCG so texture approximations render identically twice. */
function lcg(seed: number): () => number {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

/** Bubble layout in the 200×200 tile: [cx, cy, r]. */
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

/**
 * Draw the brushed/bubbles texture approximations inside the card clip.
 * Mirrors the data-URI layers: horizontal sheen lines and radial-gradient
 * spheres with the same highlight/rim stop structure.
 */
export function drawTextureApproximations(
  ctx: CanvasRenderingContext2D,
  card: { x: number; y: number; w: number; h: number },
  config: { brushed?: number; bubbles?: number }
): void {
  const brushed = Math.max(0, Math.min(1, config.brushed ?? 0))
  const bubbles = Math.max(0, Math.min(1, config.bubbles ?? 0))
  const { x, y, w, h } = card
  if (brushed > 0.01) {
    const k = brushed * 0.4
    const rnd = lcg(7)
    ctx.save()
    ctx.lineWidth = 1
    for (let ly = y + 2; ly < y + h - 2; ly += 3) {
      ctx.strokeStyle = `rgba(255,255,255,${(k * (0.25 + rnd() * 0.75)).toFixed(3)})`
      ctx.beginPath()
      ctx.moveTo(x + 2, ly)
      ctx.lineTo(x + w - 2, ly + (rnd() - 0.5) * 2)
      ctx.stroke()
    }
    ctx.restore()
  }
  if (bubbles > 0.01) {
    const k = bubbles * 0.55
    const scale = h / 200
    ctx.save()
    for (const [bx, by, br] of BUBBLE_LAYOUT) {
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
